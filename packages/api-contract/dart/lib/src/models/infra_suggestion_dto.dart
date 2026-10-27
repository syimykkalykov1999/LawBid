// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'infra_suggestion_dto_to.dart';

part 'infra_suggestion_dto.g.dart';

@JsonSerializable()
class InfraSuggestionDto {
  const InfraSuggestionDto({
    required this.id,
    required this.name,
    required this.to,
    required this.reason,
    required this.costDeltaUsd,
  });

  factory InfraSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$InfraSuggestionDtoFromJson(json);

  final String id;
  final String name;
  final InfraSuggestionDtoTo to;
  final String reason;
  final List<num> costDeltaUsd;

  Map<String, Object?> toJson() => _$InfraSuggestionDtoToJson(this);
}
