// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bid_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBidRowDto _$AdminBidRowDtoFromJson(Map<String, dynamic> json) =>
    AdminBidRowDto(
      id: json['id'] as String,
      caseId: json['caseId'] as String,
      caseTitle: json['caseTitle'] as String,
      attorneyName: json['attorneyName'] as String,
      status: json['status'] as String,
      feeType: json['feeType'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      rounds: (json['rounds'] as num).toInt(),
      outsidePractice: json['outsidePractice'] as bool,
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$AdminBidRowDtoToJson(AdminBidRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'caseTitle': instance.caseTitle,
      'attorneyName': instance.attorneyName,
      'status': instance.status,
      'feeType': instance.feeType,
      'amountCents': instance.amountCents,
      'rounds': instance.rounds,
      'outsidePractice': instance.outsidePractice,
      'createdAt': instance.createdAt,
    };
