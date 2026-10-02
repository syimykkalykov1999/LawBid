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
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminSupportMessageDtoToJson(
  AdminSupportMessageDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'authorType': instance.authorType.toJson(),
  'authorId': instance.authorId,
  'authorName': instance.authorName,
  'internal': instance.internal,
  'body': instance.body,
  'createdAt': instance.createdAt.toIso8601String(),
};
