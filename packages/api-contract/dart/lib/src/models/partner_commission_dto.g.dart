// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_commission_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerCommissionDto _$PartnerCommissionDtoFromJson(
  Map<String, dynamic> json,
) => PartnerCommissionDto(
  id: json['id'] as String,
  kind: PartnerCommissionKind.fromJson(json['kind'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  status: PartnerCommissionStatus.fromJson(json['status'] as String),
  period: json['period'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  referredUserId: json['referredUserId'] as String?,
  holdUntil: json['holdUntil'] == null
      ? null
      : DateTime.parse(json['holdUntil'] as String),
  approvedAt: json['approvedAt'] == null
      ? null
      : DateTime.parse(json['approvedAt'] as String),
  paidAt: json['paidAt'] == null
      ? null
      : DateTime.parse(json['paidAt'] as String),
  payoutRef: json['payoutRef'] as String?,
  reversedAt: json['reversedAt'] == null
      ? null
      : DateTime.parse(json['reversedAt'] as String),
  reversedReason: json['reversedReason'] as String?,
  note: json['note'] as String?,
);

Map<String, dynamic> _$PartnerCommissionDtoToJson(
  PartnerCommissionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'amountCents': instance.amountCents,
  'status': instance.status.toJson(),
  'period': instance.period,
  'referredUserId': ?instance.referredUserId,
  'holdUntil': ?instance.holdUntil?.toIso8601String(),
  'approvedAt': ?instance.approvedAt?.toIso8601String(),
  'paidAt': ?instance.paidAt?.toIso8601String(),
  'payoutRef': ?instance.payoutRef,
  'reversedAt': ?instance.reversedAt?.toIso8601String(),
  'reversedReason': ?instance.reversedReason,
  'note': ?instance.note,
  'createdAt': instance.createdAt.toIso8601String(),
};
