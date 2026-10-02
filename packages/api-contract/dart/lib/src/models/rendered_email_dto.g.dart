// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rendered_email_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RenderedEmailDto _$RenderedEmailDtoFromJson(Map<String, dynamic> json) =>
    RenderedEmailDto(
      subject: json['subject'] as String,
      text: json['text'] as String,
      html: json['html'] as String?,
    );

Map<String, dynamic> _$RenderedEmailDtoToJson(RenderedEmailDto instance) =>
    <String, dynamic>{
      'subject': instance.subject,
      'text': instance.text,
      'html': ?instance.html,
    };
