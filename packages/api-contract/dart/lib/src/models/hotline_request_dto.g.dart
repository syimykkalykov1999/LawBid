// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineRequestDto _$HotlineRequestDtoFromJson(Map<String, dynamic> json) =>
    HotlineRequestDto(
      state: json['state'] as String,
      practiceArea: json['practiceArea'] as String,
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      topic: json['topic'] as String,
    );

Map<String, dynamic> _$HotlineRequestDtoToJson(HotlineRequestDto instance) =>
    <String, dynamic>{
      'state': instance.state,
      'practiceArea': instance.practiceArea,
      'languages': instance.languages,
      'topic': instance.topic,
    };
