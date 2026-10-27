// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'infra_guards_dto.dart';
import 'infra_request_dto.dart';
import 'infra_suggestion_dto.dart';

part 'infra_overview_dto.g.dart';

@JsonSerializable()
class InfraOverviewDto {
  const InfraOverviewDto({
    required this.guards,
    required this.switchable,
    required this.requests,
    required this.suggestions,
  });

  factory InfraOverviewDto.fromJson(Map<String, Object?> json) =>
      _$InfraOverviewDtoFromJson(json);

  final InfraGuardsDto guards;
  final List<String> switchable;
  final List<InfraRequestDto> requests;
  final List<InfraSuggestionDto> suggestions;

  Map<String, Object?> toJson() => _$InfraOverviewDtoToJson(this);
}
