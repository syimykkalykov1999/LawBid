// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_dmca_counter_dto.dart';
import 'dmca_status.dart';
import 'dmca_target_type.dart';

part 'admin_dmca_notice_row_dto.g.dart';

@JsonSerializable()
class AdminDmcaNoticeRowDto {
  const AdminDmcaNoticeRowDto({
    required this.id,
    required this.status,
    required this.complainantName,
    required this.complainantEmail,
    required this.complainantAddress,
    required this.workDescription,
    required this.goodFaith,
    required this.accuracySworn,
    required this.signature,
    required this.createdAt,
    required this.updatedAt,
    this.reportId,
    this.targetType,
    this.targetId,
    this.infringingUrl,
    this.complainantPhone,
    this.submittedByUserId,
    this.authorUserId,
    this.counter,
    this.decidedBy,
    this.decidedAt,
    this.decisionNote,
  });

  factory AdminDmcaNoticeRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminDmcaNoticeRowDtoFromJson(json);

  final String id;
  final DmcaStatus status;
  final String? reportId;
  final DmcaTargetType? targetType;
  final String? targetId;
  final String? infringingUrl;
  final String complainantName;
  final String complainantEmail;
  final String complainantAddress;
  final String? complainantPhone;
  final String workDescription;
  final bool goodFaith;
  final bool accuracySworn;
  final String signature;
  final String? submittedByUserId;

  /// The content author at decision time.
  final String? authorUserId;
  final AdminDmcaCounterDto? counter;
  final String? decidedBy;
  final DateTime? decidedAt;
  final String? decisionNote;
  final DateTime createdAt;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$AdminDmcaNoticeRowDtoToJson(this);
}
