// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_partner_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachPartnerDto _$OutreachPartnerDtoFromJson(Map<String, dynamic> json) =>
    OutreachPartnerDto(
      id: json['id'] as String,
      userId: json['userId'] as String,
      name: json['name'] as String?,
      label: json['label'] as String?,
      code: json['code'] as String,
      status: json['status'] as String,
    );

Map<String, dynamic> _$OutreachPartnerDtoToJson(OutreachPartnerDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'name': ?instance.name,
      'label': ?instance.label,
      'code': instance.code,
      'status': instance.status,
    };
