// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_settlement_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerSettlementDto _$CountryPartnerSettlementDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerSettlementDto(
  id: json['id'] as String,
  period: json['period'] as String,
  currency: json['currency'] as String,
  grossCents: (json['grossCents'] as num).toInt(),
  refundsCents: (json['refundsCents'] as num).toInt(),
  feesCents: (json['feesCents'] as num).toInt(),
  netCents: (json['netCents'] as num).toInt(),
  sharePercent: json['sharePercent'] as num,
  amountCents: (json['amountCents'] as num).toInt(),
  status: json['status'] as String,
);

Map<String, dynamic> _$CountryPartnerSettlementDtoToJson(
  CountryPartnerSettlementDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'period': instance.period,
  'currency': instance.currency,
  'grossCents': instance.grossCents,
  'refundsCents': instance.refundsCents,
  'feesCents': instance.feesCents,
  'netCents': instance.netCents,
  'sharePercent': instance.sharePercent,
  'amountCents': instance.amountCents,
  'status': instance.status,
};
