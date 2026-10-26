// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_comment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelCommentDto _$ChannelCommentDtoFromJson(Map<String, dynamic> json) =>
    ChannelCommentDto(
      id: json['id'] as String,
      author: UserBriefDto.fromJson(json['author'] as Map<String, dynamic>),
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      canDelete: json['canDelete'] as bool,
    );

Map<String, dynamic> _$ChannelCommentDtoToJson(ChannelCommentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'author': instance.author.toJson(),
      'body': instance.body,
      'createdAt': instance.createdAt.toIso8601String(),
      'canDelete': instance.canDelete,
    };
