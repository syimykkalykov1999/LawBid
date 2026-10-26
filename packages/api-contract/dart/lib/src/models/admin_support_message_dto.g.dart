// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportMessageDto _$AdminSupportMessageDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportMessageDto(
  id: json['id'] as String,
  authorType: AdminSupportMessageDtoAuthorType.fromJson(
    json['authorType'] as String,
  ),
  authorId: json['authorId'] as String,
  authorName: json['authorName'] as String,
  internal: json['internal'] as bool,
  body: json['body'] as String,
  attachments: (json['attachments'] as List<dynamic>)
      .map((e) => SupportAttachmentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  auto: json['auto'] as bool?,
);

Map<String, dynamic> _$AdminSupportMessageDtoToJson(
  AdminSupportMessageDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'authorType': instance.authorType.toJson(),
  'authorId': instance.authorId,
  'authorName': instance.authorName,
  'internal': instance.internal,
  'auto': ?instance.auto,
  'body': instance.body,
  'attachments': instance.attachments.map((e) => e.toJson()).toList(),
  'createdAt': instance.createdAt.toIso8601String(),
};
