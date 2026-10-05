// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_pay_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerPayDto _$AdminPartnerPayDtoFromJson(Map<String, dynamic> json) =>
    AdminPartnerPayDto(
      payoutRef: json['payoutRef'] as String?,
      period: json['period'] as String?,
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$AdminPartnerPayDtoToJson(AdminPartnerPayDto instance) =>
    <String, dynamic>{
      'reason': instance.reason,
      'payoutRef': ?instance.payoutRef,
      'period': ?instance.period,
    };
