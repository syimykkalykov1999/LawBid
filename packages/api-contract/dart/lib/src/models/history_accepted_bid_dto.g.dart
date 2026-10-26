// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'history_accepted_bid_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HistoryAcceptedBidDto _$HistoryAcceptedBidDtoFromJson(
  Map<String, dynamic> json,
) => HistoryAcceptedBidDto(
  amountCents: (json['amountCents'] as num).toInt(),
  feeType: FeeType.fromJson(json['feeType'] as String),
  percentBps: (json['percentBps'] as num?)?.toInt(),
);

Map<String, dynamic> _$HistoryAcceptedBidDtoToJson(
  HistoryAcceptedBidDto instance,
) => <String, dynamic>{
  'amountCents': instance.amountCents,
  'percentBps': ?instance.percentBps,
  'feeType': instance.feeType.toJson(),
};
