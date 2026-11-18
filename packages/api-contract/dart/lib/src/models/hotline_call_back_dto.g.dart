// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_call_back_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineCallBackDto _$HotlineCallBackDtoFromJson(Map<String, dynamic> json) =>
    HotlineCallBackDto(
      attorneyId: json['attorneyId'] as String,
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      topic: json['topic'] as String,
    );

Map<String, dynamic> _$HotlineCallBackDtoToJson(HotlineCallBackDto instance) =>
    <String, dynamic>{
      'attorneyId': instance.attorneyId,
      'languages': instance.languages,
      'topic': instance.topic,
    };
