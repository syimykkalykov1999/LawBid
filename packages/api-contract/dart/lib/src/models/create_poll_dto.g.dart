// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_poll_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePollDto _$CreatePollDtoFromJson(Map<String, dynamic> json) =>
    CreatePollDto(
      clientMessageId: json['clientMessageId'] as String,
      question: json['question'] as String,
      options: (json['options'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      multiple: json['multiple'] as bool,
      anonymous: json['anonymous'] as bool,
      topicId: json['topicId'] as String?,
    );

Map<String, dynamic> _$CreatePollDtoToJson(CreatePollDto instance) =>
    <String, dynamic>{
      'clientMessageId': instance.clientMessageId,
      'topicId': ?instance.topicId,
      'question': instance.question,
      'options': instance.options,
      'multiple': instance.multiple,
      'anonymous': instance.anonymous,
    };
