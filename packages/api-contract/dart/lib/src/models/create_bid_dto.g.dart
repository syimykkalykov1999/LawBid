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
  amountCents: (json['amountCents'] as num?)?.toInt(),
  startDate: json['startDate'] == null
      ? null
      : DateTime.parse(json['startDate'] as String),
  estimatedDurationDays: (json['estimatedDurationDays'] as num?)?.toInt(),
);

Map<String, dynamic> _$CreateBidDtoToJson(CreateBidDto instance) =>
    <String, dynamic>{
      'feeType': instance.feeType.toJson(),
      'amountCents': ?instance.amountCents,
      'message': instance.message,
      'startAvailability': instance.startAvailability.toJson(),
      'startDate': ?instance.startDate?.toIso8601String(),
      'estimatedDurationDays': ?instance.estimatedDurationDays,
    };
