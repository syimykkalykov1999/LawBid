// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_bid_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCaseBidDto _$AdminCaseBidDtoFromJson(Map<String, dynamic> json) =>
    AdminCaseBidDto(
      id: json['id'] as String,
      attorneyId: json['attorneyId'] as String,
      attorneyName: json['attorneyName'] as String,
      status: json['status'] as String,
      feeType: json['feeType'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      rounds: (json['rounds'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminCaseBidDtoToJson(AdminCaseBidDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'attorneyId': instance.attorneyId,
      'attorneyName': instance.attorneyName,
      'status': instance.status,
      'feeType': instance.feeType,
      'amountCents': instance.amountCents,
      'rounds': instance.rounds,
      'createdAt': instance.createdAt.toIso8601String(),
    };
