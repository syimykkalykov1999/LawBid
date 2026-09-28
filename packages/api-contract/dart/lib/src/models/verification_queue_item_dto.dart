// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_attorney_summary_dto.dart';
import 'verification_request_status.dart';

part 'verification_queue_item_dto.g.dart';

@JsonSerializable()
class VerificationQueueItemDto {
  const VerificationQueueItemDto({
    required this.id,
    required this.status,
    required this.submittedAt,
    required this.attorney,
    required this.stateCodes,
    required this.reviewerId,
    required this.adminNote,
  });

  factory VerificationQueueItemDto.fromJson(Map<String, Object?> json) =>
      _$VerificationQueueItemDtoFromJson(json);

  final String id;
  final VerificationRequestStatus status;
  final DateTime? submittedAt;
  final AdminAttorneySummaryDto attorney;

  /// States of the licenses under review.
  final List<String> stateCodes;
  final String? reviewerId;

  /// System note (name re-check, license re-check).
  final String? adminNote;

  Map<String, Object?> toJson() => _$VerificationQueueItemDtoToJson(this);
}
