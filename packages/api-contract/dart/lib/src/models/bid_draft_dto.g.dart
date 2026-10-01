// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_draft_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidDraftDto _$BidDraftDtoFromJson(Map<String, dynamic> json) => BidDraftDto(
  caseId: json['caseId'] as String,
  updatedAt: json['updatedAt'] as String,
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
  preparedBy: json['preparedBy'] as String?,
);

Map<String, dynamic> _$BidDraftDtoToJson(BidDraftDto instance) =>
    <String, dynamic>{
      'feeType': ?instance.feeType?.toJson(),
      'amountCents': ?instance.amountCents,
      'message': ?instance.message,
      'startAvailability': ?instance.startAvailability?.toJson(),
      'startDate': ?instance.startDate?.toIso8601String(),
      'estimatedDurationDays': ?instance.estimatedDurationDays,
      'caseId': instance.caseId,
      'preparedBy': ?instance.preparedBy,
      'updatedAt': instance.updatedAt,
    };
