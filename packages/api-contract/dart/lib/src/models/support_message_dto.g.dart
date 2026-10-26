// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportMessageDto _$SupportMessageDtoFromJson(Map<String, dynamic> json) =>
    SupportMessageDto(
      id: json['id'] as String,
      author: SupportMessageDtoAuthor.fromJson(json['author'] as String),
      body: json['body'] as String,
      attachments: (json['attachments'] as List<dynamic>)
          .map((e) => SupportAttachmentDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      authorName: json['authorName'] as String?,
    );

Map<String, dynamic> _$SupportMessageDtoToJson(SupportMessageDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'author': instance.author.toJson(),
      'authorName': ?instance.authorName,
      'body': instance.body,
      'attachments': instance.attachments.map((e) => e.toJson()).toList(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
