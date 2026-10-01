// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_draft_body_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidDraftBodyDto _$BidDraftBodyDtoFromJson(Map<String, dynamic> json) =>
    BidDraftBodyDto(
      feeType: json['feeType'] == null
          ? null
          : FeeType.fromJson(json['feeType'] as String),
      amountCents: (json['amountCents'] as num?)?.toInt(),
      message: json['message'] as String?,
      startAvailability: json['startAvailability'] == null
          ? null
          : StartAvailability.fromJson(json['startAvailability'] as String),
      startDate: json['startDate'] == null
          ? null
          : DateTime.parse(json['startDate'] as String),
      estimatedDurationDays: (json['estimatedDurationDays'] as num?)?.toInt(),
    );

Map<String, dynamic> _$BidDraftBodyDtoToJson(BidDraftBodyDto instance) =>
    <String, dynamic>{
      'feeType': ?instance.feeType?.toJson(),
      'amountCents': ?instance.amountCents,
      'message': ?instance.message,
      'startAvailability': ?instance.startAvailability?.toJson(),
      'startDate': ?instance.startDate?.toIso8601String(),
      'estimatedDurationDays': ?instance.estimatedDurationDays,
    };
