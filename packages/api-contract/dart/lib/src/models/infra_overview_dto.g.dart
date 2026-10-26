// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'infra_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfraOverviewDto _$InfraOverviewDtoFromJson(Map<String, dynamic> json) =>
    InfraOverviewDto(
      guards: InfraGuardsDto.fromJson(json['guards'] as Map<String, dynamic>),
      switchable: (json['switchable'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      requests: (json['requests'] as List<dynamic>)
          .map((e) => InfraRequestDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      suggestions: (json['suggestions'] as List<dynamic>)
          .map((e) => InfraSuggestionDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$InfraOverviewDtoToJson(InfraOverviewDto instance) =>
    <String, dynamic>{
      'guards': instance.guards.toJson(),
      'switchable': instance.switchable,
      'requests': instance.requests.map((e) => e.toJson()).toList(),
      'suggestions': instance.suggestions.map((e) => e.toJson()).toList(),
    };
