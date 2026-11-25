// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_waiting_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineWaitingDto _$HotlineWaitingDtoFromJson(Map<String, dynamic> json) =>
    HotlineWaitingDto(
      requestId: json['requestId'] as String,
      topic: json['topic'] as String,
      state: json['state'] as String,
      practiceArea: json['practiceArea'] as String,
      language: json['language'] as String,
      waitingSince: json['waitingSince'] as num,
    );

Map<String, dynamic> _$HotlineWaitingDtoToJson(HotlineWaitingDto instance) =>
    <String, dynamic>{
      'requestId': instance.requestId,
      'topic': instance.topic,
      'state': instance.state,
      'practiceArea': instance.practiceArea,
      'language': instance.language,
      'waitingSince': instance.waitingSince,
    };
