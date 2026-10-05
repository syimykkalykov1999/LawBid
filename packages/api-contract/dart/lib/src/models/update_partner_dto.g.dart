// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_partner_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdatePartnerDto _$UpdatePartnerDtoFromJson(Map<String, dynamic> json) =>
    UpdatePartnerDto(
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
      status: json['status'] == null
          ? null
          : PartnerStatus.fromJson(json['status'] as String),
    );

Map<String, dynamic> _$UpdatePartnerDtoToJson(UpdatePartnerDto instance) =>
    <String, dynamic>{
      'label': ?instance.label,
      'note': ?instance.note,
      'attorneyRateCents': ?instance.attorneyRateCents,
      'clientRateCents': ?instance.clientRateCents,
      'monthlyBaseCents': ?instance.monthlyBaseCents,
      'clientRule': ?instance.clientRule?.toJson(),
      'holdDays': ?instance.holdDays,
      'status': ?instance.status?.toJson(),
      'reason': instance.reason,
    };
