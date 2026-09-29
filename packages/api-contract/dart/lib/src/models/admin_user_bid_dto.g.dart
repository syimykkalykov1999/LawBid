// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_bid_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserBidDto _$AdminUserBidDtoFromJson(Map<String, dynamic> json) =>
    AdminUserBidDto(
      id: json['id'] as String,
      caseId: json['caseId'] as String,
      caseTitle: json['caseTitle'] as String,
      status: json['status'] as String,
      feeType: json['feeType'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminUserBidDtoToJson(AdminUserBidDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'caseTitle': instance.caseTitle,
      'status': instance.status,
      'feeType': instance.feeType,
      'amountCents': instance.amountCents,
      'createdAt': instance.createdAt.toIso8601String(),
    };
