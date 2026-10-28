// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_offer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealOfferDto _$DealOfferDtoFromJson(Map<String, dynamic> json) => DealOfferDto(
  feeType: FeeType.fromJson(json['feeType'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  percentBps: (json['percentBps'] as num?)?.toInt(),
  roundNo: (json['roundNo'] as num).toInt(),
  fromRole: PartyRole.fromJson(json['fromRole'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  message: json['message'] as String?,
  status: json['status'] as String,
  paymentTerms: json['paymentTerms'] == null
      ? null
      : PaymentTermsDto.fromJson(json['paymentTerms'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DealOfferDtoToJson(DealOfferDto instance) =>
    <String, dynamic>{
      'feeType': instance.feeType.toJson(),
      'amountCents': instance.amountCents,
      'percentBps': ?instance.percentBps,
      'paymentTerms': ?instance.paymentTerms?.toJson(),
      'roundNo': instance.roundNo,
      'fromRole': instance.fromRole.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
      'message': ?instance.message,
      'status': instance.status,
    };
