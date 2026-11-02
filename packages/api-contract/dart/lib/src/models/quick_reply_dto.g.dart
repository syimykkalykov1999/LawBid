// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'quick_reply_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuickReplyDto _$QuickReplyDtoFromJson(Map<String, dynamic> json) =>
    QuickReplyDto(
      id: json['id'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
    );

Map<String, dynamic> _$QuickReplyDtoToJson(QuickReplyDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'body': instance.body,
    };
