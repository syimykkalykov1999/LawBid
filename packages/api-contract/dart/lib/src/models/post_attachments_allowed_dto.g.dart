// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_attachments_allowed_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostAttachmentsAllowedDto _$PostAttachmentsAllowedDtoFromJson(
  Map<String, dynamic> json,
) => PostAttachmentsAllowedDto(
  allowed: json['allowed'] as bool,
  mode: PostAttachmentsAllowedDtoMode.fromJson(json['mode'] as String),
);

Map<String, dynamic> _$PostAttachmentsAllowedDtoToJson(
  PostAttachmentsAllowedDto instance,
) => <String, dynamic>{
  'allowed': instance.allowed,
  'mode': instance.mode.toJson(),
};
