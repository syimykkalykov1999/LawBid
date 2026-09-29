// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_history_event_dto_actor_role.dart';

part 'case_history_event_dto.g.dart';

@JsonSerializable()
class CaseHistoryEventDto {
  const CaseHistoryEventDto({
    required this.id,
    required this.eventType,
    required this.createdAt,
    required this.actorRole,
    this.amountCents,
    this.feeType,
    this.roundNo,
    this.reason,
  });

  factory CaseHistoryEventDto.fromJson(Map<String, Object?> json) =>
      _$CaseHistoryEventDtoFromJson(json);

  final String id;
  final String eventType;
  final String createdAt;
  final CaseHistoryEventDtoActorRole actorRole;
  final num? amountCents;
  final String? feeType;
  final num? roundNo;
  final String? reason;

  Map<String, Object?> toJson() => _$CaseHistoryEventDtoToJson(this);
}
