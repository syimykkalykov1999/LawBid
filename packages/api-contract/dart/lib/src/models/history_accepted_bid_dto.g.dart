// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'history_accepted_bid_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HistoryAcceptedBidDto _$HistoryAcceptedBidDtoFromJson(
  Map<String, dynamic> json,
) => HistoryAcceptedBidDto(
  amountCents: json['amountCents'] as num,
  feeType: json['feeType'] as String,
);

Map<String, dynamic> _$HistoryAcceptedBidDtoToJson(
  HistoryAcceptedBidDto instance,
) => <String, dynamic>{
  'amountCents': instance.amountCents,
  'feeType': instance.feeType,
};
