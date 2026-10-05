// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_invite_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCaseInviteDto _$AdminCaseInviteDtoFromJson(Map<String, dynamic> json) =>
    AdminCaseInviteDto(
      id: json['id'] as String,
      attorneyId: json['attorneyId'] as String,
      attorneyName: json['attorneyName'] as String,
      status: json['status'] as String,
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
      declineReason: json['declineReason'] as String?,
      bidId: json['bidId'] as String?,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminCaseInviteDtoToJson(AdminCaseInviteDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'attorneyId': instance.attorneyId,
      'attorneyName': instance.attorneyName,
      'status': instance.status,
      'budgetCents': ?instance.budgetCents,
      'declineReason': ?instance.declineReason,
      'bidId': ?instance.bidId,
      'expiresAt': instance.expiresAt.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
