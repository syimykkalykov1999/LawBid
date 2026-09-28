// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_offer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidOfferDto _$BidOfferDtoFromJson(Map<String, dynamic> json) => BidOfferDto(
  id: json['id'] as String,
  roundNo: (json['roundNo'] as num).toInt(),
  fromRole: PartyRole.fromJson(json['fromRole'] as String),
  feeType: FeeType.fromJson(json['feeType'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  message: json['message'] as String?,
  status: OfferStatus.fromJson(json['status'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$BidOfferDtoToJson(BidOfferDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'roundNo': instance.roundNo,
      'fromRole': instance.fromRole.toJson(),
      'feeType': instance.feeType.toJson(),
      'amountCents': instance.amountCents,
      'message': ?instance.message,
      'status': instance.status.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
