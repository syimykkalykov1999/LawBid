// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_status.dart';
import 'dmca_target_type.dart';

part 'dmca_notice_brief_dto.g.dart';

@JsonSerializable()
class DmcaNoticeBriefDto {
  const DmcaNoticeBriefDto({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.canCounter,
    this.targetType,
    this.targetId,
    this.infringingUrl,
    this.decidedAt,
    this.decisionNote,
    this.counterSubmittedAt,
  });

  factory DmcaNoticeBriefDto.fromJson(Map<String, Object?> json) =>
      _$DmcaNoticeBriefDtoFromJson(json);

  final String id;
  final DmcaStatus status;
  final DmcaTargetType? targetType;
  final String? targetId;
  final String? infringingUrl;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final String? decisionNote;

  /// When the author filed a counter-notice.
  final DateTime? counterSubmittedAt;

  /// The viewer is the content author and may file a counter-notice now.
  final bool canCounter;

  Map<String, Object?> toJson() => _$DmcaNoticeBriefDtoToJson(this);
}
