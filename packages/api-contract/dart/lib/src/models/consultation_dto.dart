// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consultation_dto_cancelled_by.dart';
import 'consultation_dto_status.dart';
import 'consultation_dto_viewer_role.dart';
import 'consultation_person_dto.dart';

part 'consultation_dto.g.dart';

@JsonSerializable()
class ConsultationDto {
  const ConsultationDto({
    required this.id,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.viewerRole,
    required this.counterpart,
    required this.attorneyTimezone,
    required this.canCall,
    required this.createdAt,
    this.note,
    this.caseId,
    this.conversationId,
    this.cancelReason,
    this.cancelledBy,
    this.rescheduledAt,
  });

  factory ConsultationDto.fromJson(Map<String, Object?> json) =>
      _$ConsultationDtoFromJson(json);

  final String id;
  final ConsultationDtoStatus status;

  /// Start (UTC ISO)
  final String startsAt;

  /// End (UTC ISO)
  final String endsAt;

  /// The viewer's side
  final ConsultationDtoViewerRole viewerRole;

  /// The other side
  final ConsultationPersonDto counterpart;
  final String attorneyTimezone;
  final String? note;
  final String? caseId;
  final String? conversationId;
  final String? cancelReason;
  final ConsultationDtoCancelledBy? cancelledBy;
  final String? rescheduledAt;

  /// A call can be placed now: confirmed and within 10 minutes before the start until the end.
  final bool canCall;
  final String createdAt;

  Map<String, Object?> toJson() => _$ConsultationDtoToJson(this);
}
