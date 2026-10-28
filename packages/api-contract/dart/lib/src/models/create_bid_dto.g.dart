// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_bid_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateBidDto _$CreateBidDtoFromJson(Map<String, dynamic> json) => CreateBidDto(
  feeType: FeeType.fromJson(json['feeType'] as String),
  message: json['message'] as String,
  startAvailability: StartAvailability.fromJson(
    json['startAvailability'] as String,
  ),
  sendAsAttorneyId: json['sendAsAttorneyId'] as String?,
  paymentTerms: json['paymentTerms'] == null
      ? null
      : PaymentTermsDto.fromJson(json['paymentTerms'] as Map<String, dynamic>),
  amountCents: (json['amountCents'] as num?)?.toInt(),
  percentBps: (json['percentBps'] as num?)?.toInt(),
  startDate: json['startDate'] == null
      ? null
      : DateTime.parse(json['startDate'] as String),
  estimatedDurationDays: (json['estimatedDurationDays'] as num?)?.toInt(),
);

Map<String, dynamic> _$CreateBidDtoToJson(CreateBidDto instance) =>
    <String, dynamic>{
      'sendAsAttorneyId': ?instance.sendAsAttorneyId,
      'paymentTerms': ?instance.paymentTerms?.toJson(),
      'feeType': instance.feeType.toJson(),
      'amountCents': ?instance.amountCents,
      'percentBps': ?instance.percentBps,
      'message': instance.message,
      'startAvailability': instance.startAvailability.toJson(),
      'startDate': ?instance.startDate?.toIso8601String(),
      'estimatedDurationDays': ?instance.estimatedDurationDays,
    };
