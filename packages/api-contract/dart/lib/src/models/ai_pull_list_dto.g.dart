// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_pull_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiPullListDto _$AiPullListDtoFromJson(Map<String, dynamic> json) =>
    AiPullListDto(
      pulls: (json['pulls'] as List<dynamic>)
          .map((e) => AiPullDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$AiPullListDtoToJson(AiPullListDto instance) =>
    <String, dynamic>{
      'pulls': instance.pulls.map((e) => e.toJson()).toList(),
      'error': ?instance.error,
    };
