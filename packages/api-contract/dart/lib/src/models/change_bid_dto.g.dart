// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'change_bid_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChangeBidDto _$ChangeBidDtoFromJson(Map<String, dynamic> json) => ChangeBidDto(
  feeType: FeeType.fromJson(json['feeType'] as String),
  paymentTerms: json['paymentTerms'] == null
      ? null
      : PaymentTermsDto.fromJson(json['paymentTerms'] as Map<String, dynamic>),
  amountCents: (json['amountCents'] as num?)?.toInt(),
  percentBps: (json['percentBps'] as num?)?.toInt(),
  message: json['message'] as String?,
);

Map<String, dynamic> _$ChangeBidDtoToJson(ChangeBidDto instance) =>
    <String, dynamic>{
      'paymentTerms': ?instance.paymentTerms?.toJson(),
      'amountCents': ?instance.amountCents,
      'percentBps': ?instance.percentBps,
      'message': ?instance.message,
      'feeType': instance.feeType.toJson(),
    };
