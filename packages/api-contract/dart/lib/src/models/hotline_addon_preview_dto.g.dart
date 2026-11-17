// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_addon_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineAddonPreviewDto _$HotlineAddonPreviewDtoFromJson(
  Map<String, dynamic> json,
) => HotlineAddonPreviewDto(
  amountNowCents: (json['amountNowCents'] as num).toInt(),
  currency: json['currency'] as String,
  prorationDate: (json['prorationDate'] as num).toInt(),
  periodEnd: json['periodEnd'] == null
      ? null
      : DateTime.parse(json['periodEnd'] as String),
  priceCents: (json['priceCents'] as num).toInt(),
  monthlyIncreaseCents: (json['monthlyIncreaseCents'] as num).toInt(),
  nextChargeCents: (json['nextChargeCents'] as num).toInt(),
  taxCents: (json['taxCents'] as num?)?.toInt(),
);

Map<String, dynamic> _$HotlineAddonPreviewDtoToJson(
  HotlineAddonPreviewDto instance,
) => <String, dynamic>{
  'amountNowCents': instance.amountNowCents,
  'taxCents': ?instance.taxCents,
  'currency': instance.currency,
  'prorationDate': instance.prorationDate,
  'periodEnd': ?instance.periodEnd?.toIso8601String(),
  'priceCents': instance.priceCents,
  'monthlyIncreaseCents': instance.monthlyIncreaseCents,
  'nextChargeCents': instance.nextChargeCents,
};
