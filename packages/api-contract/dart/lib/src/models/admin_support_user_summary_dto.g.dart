// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_user_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportUserSummaryDto _$AdminSupportUserSummaryDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportUserSummaryDto(
  id: json['id'] as String,
  name: json['name'] as String,
  status: json['status'] as String,
  uiLanguage: json['uiLanguage'] as String,
  hasEmail: json['hasEmail'] as bool,
  hasPhone: json['hasPhone'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  username: json['username'] as String?,
  role: json['role'] as String?,
  subscriptionActive: json['subscriptionActive'] as bool?,
);

Map<String, dynamic> _$AdminSupportUserSummaryDtoToJson(
  AdminSupportUserSummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'username': ?instance.username,
  'role': ?instance.role,
  'status': instance.status,
  'uiLanguage': instance.uiLanguage,
  'hasEmail': instance.hasEmail,
  'hasPhone': instance.hasPhone,
  'subscriptionActive': ?instance.subscriptionActive,
  'createdAt': instance.createdAt.toIso8601String(),
};
