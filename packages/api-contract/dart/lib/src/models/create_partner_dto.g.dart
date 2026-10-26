// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_partner_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePartnerDto _$CreatePartnerDtoFromJson(Map<String, dynamic> json) =>
    CreatePartnerDto(
      reason: json['reason'] as String? ?? '',
      label: json['label'] as String?,
      note: json['note'] as String?,
      attorneyRateCents: (json['attorneyRateCents'] as num?)?.toInt(),
      clientRateCents: (json['clientRateCents'] as num?)?.toInt(),
      monthlyBaseCents: (json['monthlyBaseCents'] as num?)?.toInt(),
      clientRule: json['clientRule'] == null
          ? null
          : PartnerClientRule.fromJson(json['clientRule'] as String),
      holdDays: (json['holdDays'] as num?)?.toInt(),
      userId: json['userId'] as String?,
      externalName: json['externalName'] as String?,
      externalContact: json['externalContact'] as String?,
      code: json['code'] as String?,
    );

Map<String, dynamic> _$CreatePartnerDtoToJson(CreatePartnerDto instance) =>
    <String, dynamic>{
      'label': ?instance.label,
      'note': ?instance.note,
      'attorneyRateCents': ?instance.attorneyRateCents,
      'clientRateCents': ?instance.clientRateCents,
      'monthlyBaseCents': ?instance.monthlyBaseCents,
      'clientRule': ?instance.clientRule?.toJson(),
      'holdDays': ?instance.holdDays,
      'userId': ?instance.userId,
      'externalName': ?instance.externalName,
      'externalContact': ?instance.externalContact,
      'code': ?instance.code,
      'reason': instance.reason,
    };
