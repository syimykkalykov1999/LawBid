// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_attachments_mode_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostAttachmentsModeDto _$PostAttachmentsModeDtoFromJson(
  Map<String, dynamic> json,
) => PostAttachmentsModeDto(
  mode: PostAttachmentsModeDtoMode.fromJson(json['mode'] as String),
  keepAfterCancel: json['keepAfterCancel'] as bool?,
);

Map<String, dynamic> _$PostAttachmentsModeDtoToJson(
  PostAttachmentsModeDto instance,
) => <String, dynamic>{
  'mode': instance.mode.toJson(),
  'keepAfterCancel': ?instance.keepAfterCancel,
};
