// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_event_dto.g.dart';

@JsonSerializable()
class TrustEventDto {
  const TrustEventDto({
    required this.id,
    required this.kind,
    required this.fromLevel,
    required this.toLevel,
    required this.actorType,
    required this.actorId,
    required this.details,
    required this.createdAt,
  });

  factory TrustEventDto.fromJson(Map<String, Object?> json) =>
      _$TrustEventDtoFromJson(json);

  final String id;
  final String kind;
  final int? fromLevel;
  final int? toLevel;
  final String actorType;
  final String? actorId;
  final dynamic details;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$TrustEventDtoToJson(this);
}
