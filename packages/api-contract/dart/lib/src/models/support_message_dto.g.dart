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
      createdAt: DateTime.parse(json['createdAt'] as String),
      authorName: json['authorName'] as String?,
    );

Map<String, dynamic> _$SupportMessageDtoToJson(SupportMessageDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'author': instance.author.toJson(),
      'authorName': ?instance.authorName,
      'body': instance.body,
      'createdAt': instance.createdAt.toIso8601String(),
    };
