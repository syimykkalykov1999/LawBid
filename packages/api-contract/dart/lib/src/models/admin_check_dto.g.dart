// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_check_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCheckDto _$AdminCheckDtoFromJson(Map<String, dynamic> json) =>
    AdminCheckDto(
      id: json['id'] as String,
      checkType: VerificationCheckType.fromJson(json['checkType'] as String),
      provider: VerificationProvider.fromJson(json['provider'] as String),
      result: CheckResult.fromJson(json['result'] as String),
      details: json['details'],
      checkedAt: DateTime.parse(json['checkedAt'] as String),
    );

Map<String, dynamic> _$AdminCheckDtoToJson(AdminCheckDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'checkType': instance.checkType.toJson(),
      'provider': instance.provider.toJson(),
      'result': instance.result.toJson(),
      'details': ?instance.details,
      'checkedAt': instance.checkedAt.toIso8601String(),
    };
