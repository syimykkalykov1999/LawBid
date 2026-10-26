// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_month_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerMonthDto _$CountryPartnerMonthDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerMonthDto(
  currency: json['currency'] as String,
  grossCents: (json['grossCents'] as num).toInt(),
  refundsCents: (json['refundsCents'] as num).toInt(),
  feesCents: (json['feesCents'] as num).toInt(),
  netCents: (json['netCents'] as num).toInt(),
  amountCents: (json['amountCents'] as num).toInt(),
);

Map<String, dynamic> _$CountryPartnerMonthDtoToJson(
  CountryPartnerMonthDto instance,
) => <String, dynamic>{
  'currency': instance.currency,
  'grossCents': instance.grossCents,
  'refundsCents': instance.refundsCents,
  'feesCents': instance.feesCents,
  'netCents': instance.netCents,
  'amountCents': instance.amountCents,
};
