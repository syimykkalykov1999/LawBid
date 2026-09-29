// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_recovery_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRecoveryDto _$AdminRecoveryDtoFromJson(Map<String, dynamic> json) =>
    AdminRecoveryDto(
      ticket: json['ticket'] as String,
      recoveryCode: json['recoveryCode'] as String,
    );

Map<String, dynamic> _$AdminRecoveryDtoToJson(AdminRecoveryDto instance) =>
    <String, dynamic>{
      'ticket': instance.ticket,
      'recoveryCode': instance.recoveryCode,
    };
