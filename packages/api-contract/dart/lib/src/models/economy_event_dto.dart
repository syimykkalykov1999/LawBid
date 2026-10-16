// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'economy_event_dto_kind.dart';

part 'economy_event_dto.g.dart';

@JsonSerializable()
class EconomyEventDto {
  const EconomyEventDto({
    required this.at,
    required this.kind,
    required this.text,
  });

  factory EconomyEventDto.fromJson(Map<String, Object?> json) =>
      _$EconomyEventDtoFromJson(json);

  final String at;
  final EconomyEventDtoKind kind;
  final String text;

  Map<String, Object?> toJson() => _$EconomyEventDtoToJson(this);
}
