// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ask_question_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AskQuestionDto _$AskQuestionDtoFromJson(Map<String, dynamic> json) =>
    AskQuestionDto(
      title: json['title'] as String,
      body: json['body'] as String,
      anonymous: json['anonymous'] as bool? ?? false,
      practiceAreaId: json['practiceAreaId'] as String?,
      stateCode: json['stateCode'] as String?,
    );

Map<String, dynamic> _$AskQuestionDtoToJson(AskQuestionDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'body': instance.body,
      'practiceAreaId': ?instance.practiceAreaId,
      'stateCode': ?instance.stateCode,
      'anonymous': instance.anonymous,
    };
