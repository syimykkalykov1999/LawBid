// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'incident_dto.g.dart';

@JsonSerializable()
class IncidentDto {
  const IncidentDto({
    required this.id,
    required this.component,
    required this.openedAt,
    required this.closedAt,
    required this.detail,
  });

  factory IncidentDto.fromJson(Map<String, Object?> json) =>
      _$IncidentDtoFromJson(json);

  final String id;

  /// The board item key: database, redis, push …
  final String component;
  final DateTime openedAt;
  final DateTime? closedAt;
  final dynamic detail;

  Map<String, Object?> toJson() => _$IncidentDtoToJson(this);
}
