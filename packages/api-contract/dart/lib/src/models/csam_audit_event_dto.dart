// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'csam_audit_event_dto.g.dart';

@JsonSerializable()
class CsamAuditEventDto {
  const CsamAuditEventDto({
    required this.at,
    required this.event,
    required this.actor,
    required this.detail,
  });

  factory CsamAuditEventDto.fromJson(Map<String, Object?> json) =>
      _$CsamAuditEventDtoFromJson(json);

  final DateTime at;

  /// opened | submit_skipped | submitted | manual_required | failed
  final String event;
  final String? actor;
  final dynamic detail;

  Map<String, Object?> toJson() => _$CsamAuditEventDtoToJson(this);
}
