// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_reply_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportReplyDto _$AdminSupportReplyDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportReplyDto(
  body: json['body'] as String,
  status: json['status'] == null
      ? null
      : AdminSupportReplyDtoStatus.fromJson(json['status'] as String),
  internal: json['internal'] as bool? ?? false,
);

Map<String, dynamic> _$AdminSupportReplyDtoToJson(
  AdminSupportReplyDto instance,
) => <String, dynamic>{
  'body': instance.body,
  'internal': instance.internal,
  'status': ?instance.status?.toJson(),
};
