// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_terms_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealTermsDto _$DealTermsDtoFromJson(Map<String, dynamic> json) => DealTermsDto(
  feeType: FeeType.fromJson(json['feeType'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  percentBps: (json['percentBps'] as num?)?.toInt(),
  paymentTerms: json['paymentTerms'] == null
      ? null
      : PaymentTermsDto.fromJson(json['paymentTerms'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DealTermsDtoToJson(DealTermsDto instance) =>
    <String, dynamic>{
      'feeType': instance.feeType.toJson(),
      'amountCents': instance.amountCents,
      'percentBps': ?instance.percentBps,
      'paymentTerms': ?instance.paymentTerms?.toJson(),
    };
