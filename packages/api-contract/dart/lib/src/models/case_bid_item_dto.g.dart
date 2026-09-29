// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_bid_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseBidItemDto _$CaseBidItemDtoFromJson(Map<String, dynamic> json) =>
    CaseBidItemDto(
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
      attorney: BidAttorneySummaryDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$CaseBidItemDtoToJson(CaseBidItemDto instance) =>
    <String, dynamic>{
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
      'attorney': instance.attorney.toJson(),
    };
