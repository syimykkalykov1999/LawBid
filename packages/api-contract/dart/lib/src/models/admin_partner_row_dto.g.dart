// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerRowDto _$AdminPartnerRowDtoFromJson(Map<String, dynamic> json) =>
    AdminPartnerRowDto(
      id: json['id'] as String,
      user: AdminPartnerUserDto.fromJson(json['user'] as Map<String, dynamic>),
      status: PartnerStatus.fromJson(json['status'] as String),
      code: json['code'] as String,
      shareUrl: json['shareUrl'] as String,
      rates: PartnerRatesDto.fromJson(json['rates'] as Map<String, dynamic>),
      totals: PartnerTotalsDto.fromJson(json['totals'] as Map<String, dynamic>),
      createdAt: DateTime.parse(json['createdAt'] as String),
      demoAccess: json['demoAccess'] as bool,
      externalValue: json['external'] == null
          ? null
          : AdminPartnerExternalDto.fromJson(
              json['external'] as Map<String, dynamic>,
            ),
      label: json['label'] as String?,
      note: json['note'] as String?,
      attorneyRateCents: (json['attorneyRateCents'] as num?)?.toInt(),
      clientRateCents: (json['clientRateCents'] as num?)?.toInt(),
      clientRule: json['clientRule'] == null
          ? null
          : PartnerClientRule.fromJson(json['clientRule'] as String),
      holdDays: (json['holdDays'] as num?)?.toInt(),
      endedAt: json['endedAt'] == null
          ? null
          : DateTime.parse(json['endedAt'] as String),
      termsAcceptedAt: json['termsAcceptedAt'] == null
          ? null
          : DateTime.parse(json['termsAcceptedAt'] as String),
      termsVersion: json['termsVersion'] as String?,
      w9ReceivedAt: json['w9ReceivedAt'] == null
          ? null
          : DateTime.parse(json['w9ReceivedAt'] as String),
    );

Map<String, dynamic> _$AdminPartnerRowDtoToJson(AdminPartnerRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'user': instance.user.toJson(),
      'status': instance.status.toJson(),
      'label': ?instance.label,
      'note': ?instance.note,
      'code': instance.code,
      'shareUrl': instance.shareUrl,
      'rates': instance.rates.toJson(),
      'attorneyRateCents': ?instance.attorneyRateCents,
      'clientRateCents': ?instance.clientRateCents,
      'clientRule': ?instance.clientRule?.toJson(),
      'holdDays': ?instance.holdDays,
      'totals': instance.totals.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
      'endedAt': ?instance.endedAt?.toIso8601String(),
      'termsAcceptedAt': ?instance.termsAcceptedAt?.toIso8601String(),
      'termsVersion': ?instance.termsVersion,
      'w9ReceivedAt': ?instance.w9ReceivedAt?.toIso8601String(),
      'demoAccess': instance.demoAccess,
      'external': ?instance.externalValue?.toJson(),
    };
