// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'custody_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CustodyEntryDto _$CustodyEntryDtoFromJson(Map<String, dynamic> json) =>
    CustodyEntryDto(
      at: json['at'] as String,
      adminId: json['adminId'] as String,
      action: json['action'] as String,
      ip: json['ip'] as String?,
      details: json['details'],
    );

Map<String, dynamic> _$CustodyEntryDtoToJson(CustodyEntryDto instance) =>
    <String, dynamic>{
      'at': instance.at,
      'adminId': instance.adminId,
      'action': instance.action,
      'ip': ?instance.ip,
      'details': ?instance.details,
    };
