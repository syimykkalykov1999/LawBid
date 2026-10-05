// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerMeDto _$PartnerMeDtoFromJson(Map<String, dynamic> json) => PartnerMeDto(
  isPartner: json['isPartner'] as bool,
  code: json['code'] as String,
  shareUrl: json['shareUrl'] as String,
  rates: PartnerRatesDto.fromJson(json['rates'] as Map<String, dynamic>),
  totals: PartnerTotalsDto.fromJson(json['totals'] as Map<String, dynamic>),
  referred: (json['referred'] as List<dynamic>)
      .map((e) => PartnerReferredUserDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  commissions: (json['commissions'] as List<dynamic>)
      .map((e) => PartnerCommissionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  texts: PartnerTextsDto.fromJson(json['texts'] as Map<String, dynamic>),
  status: json['status'] == null
      ? null
      : PartnerStatus.fromJson(json['status'] as String),
);

Map<String, dynamic> _$PartnerMeDtoToJson(PartnerMeDto instance) =>
    <String, dynamic>{
      'isPartner': instance.isPartner,
      'status': ?instance.status?.toJson(),
      'code': instance.code,
      'shareUrl': instance.shareUrl,
      'rates': instance.rates.toJson(),
      'totals': instance.totals.toJson(),
      'referred': instance.referred.map((e) => e.toJson()).toList(),
      'commissions': instance.commissions.map((e) => e.toJson()).toList(),
      'texts': instance.texts.toJson(),
    };
