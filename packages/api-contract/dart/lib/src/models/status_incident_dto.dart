// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'status_incident_dto_component.dart';
import 'status_incident_dto_kind.dart';

part 'status_incident_dto.g.dart';

@JsonSerializable()
class StatusIncidentDto {
  const StatusIncidentDto({
    required this.id,
    required this.component,
    required this.kind,
    required this.titleRu,
    required this.titleEn,
    required this.messageRu,
    required this.messageEn,
    required this.startedAt,
    required this.resolvedAt,
  });

  factory StatusIncidentDto.fromJson(Map<String, Object?> json) =>
      _$StatusIncidentDtoFromJson(json);

  final String id;
  final StatusIncidentDtoComponent component;
  final StatusIncidentDtoKind kind;
  final String titleRu;
  final String titleEn;
  final String messageRu;
  final String messageEn;
  final DateTime startedAt;
  final DateTime? resolvedAt;

  Map<String, Object?> toJson() => _$StatusIncidentDtoToJson(this);
}
