// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_case_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserCaseDto _$AdminUserCaseDtoFromJson(Map<String, dynamic> json) =>
    AdminUserCaseDto(
      id: json['id'] as String,
      title: json['title'] as String,
      status: json['status'] as String,
      stateCode: json['stateCode'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminUserCaseDtoToJson(AdminUserCaseDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'status': instance.status,
      'stateCode': instance.stateCode,
      'createdAt': instance.createdAt.toIso8601String(),
    };
