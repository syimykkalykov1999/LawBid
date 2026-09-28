// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidDto _$BidDtoFromJson(Map<String, dynamic> json) => BidDto(
  id: json['id'] as String,
  caseId: json['caseId'] as String,
  attorneyId: json['attorneyId'] as String,
  status: BidStatus.fromJson(json['status'] as String),
  feeType: FeeType.fromJson(json['feeType'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  message: json['message'] as String,
  startAvailability: StartAvailability.fromJson(
    json['startAvailability'] as String,
  ),
  startDate: json['startDate'] == null
      ? null
      : DateTime.parse(json['startDate'] as String),
  estimatedDurationDays: (json['estimatedDurationDays'] as num?)?.toInt(),
  roundCount: (json['roundCount'] as num).toInt(),
  turn: PartyRole.fromJson(json['turn'] as String),
  decidedAt: json['decidedAt'] == null
      ? null
      : DateTime.parse(json['decidedAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  offers: (json['offers'] as List<dynamic>)
      .map((e) => BidOfferDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$BidDtoToJson(BidDto instance) => <String, dynamic>{
  'id': instance.id,
  'caseId': instance.caseId,
  'attorneyId': instance.attorneyId,
  'status': instance.status.toJson(),
  'feeType': instance.feeType.toJson(),
  'amountCents': instance.amountCents,
  'message': instance.message,
  'startAvailability': instance.startAvailability.toJson(),
  'startDate': ?instance.startDate?.toIso8601String(),
  'estimatedDurationDays': ?instance.estimatedDurationDays,
  'roundCount': instance.roundCount,
  'turn': instance.turn.toJson(),
  'decidedAt': ?instance.decidedAt?.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
  'offers': instance.offers.map((e) => e.toJson()).toList(),
};
