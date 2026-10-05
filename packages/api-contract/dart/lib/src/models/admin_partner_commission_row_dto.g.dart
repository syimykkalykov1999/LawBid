// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_commission_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerCommissionRowDto _$AdminPartnerCommissionRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminPartnerCommissionRowDto(
  id: json['id'] as String,
  kind: PartnerCommissionKind.fromJson(json['kind'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  status: PartnerCommissionStatus.fromJson(json['status'] as String),
  period: json['period'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  partnerId: json['partnerId'] as String,
  partner: AdminPartnerUserDto.fromJson(
    json['partner'] as Map<String, dynamic>,
  ),
  eventRef: json['eventRef'] as String,
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
  referredUser: json['referredUser'] == null
      ? null
      : AdminPartnerUserDto.fromJson(
          json['referredUser'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$AdminPartnerCommissionRowDtoToJson(
  AdminPartnerCommissionRowDto instance,
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
  'partnerId': instance.partnerId,
  'partner': instance.partner.toJson(),
  'referredUser': ?instance.referredUser?.toJson(),
  'eventRef': instance.eventRef,
};
