// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_trust_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTrustCardDto _$AdminTrustCardDtoFromJson(
  Map<String, dynamic> json,
) => AdminTrustCardDto(
  attorney: AdminTrustAttorneyDto.fromJson(
    json['attorney'] as Map<String, dynamic>,
  ),
  level: (json['level'] as num).toInt(),
  badgeStatus: AdminTrustCardDtoBadgeStatus.fromJson(
    json['badgeStatus'] as String,
  ),
  badge: json['badge'] as bool,
  signals: TrustSignalsDto.fromJson(json['signals'] as Map<String, dynamic>),
  holds: TrustHoldsDto.fromJson(json['holds'] as Map<String, dynamic>),
  bidsGate: TrustGateDto.fromJson(json['bidsGate'] as Map<String, dynamic>),
  paymentsGate: TrustGateDto.fromJson(
    json['paymentsGate'] as Map<String, dynamic>,
  ),
  cleared: json['cleared'] as bool,
  clearedBy: json['clearedBy'] == null
      ? null
      : AdminTrustCardDtoClearedBy.fromJson(json['clearedBy'] as String),
  staffClearedAt: json['staffClearedAt'] == null
      ? null
      : DateTime.parse(json['staffClearedAt'] as String),
  staffClearedBy: json['staffClearedBy'] == null
      ? null
      : StaffAdminDto.fromJson(json['staffClearedBy'] as Map<String, dynamic>),
  staffStatus: AdminTrustCardDtoStaffStatus.fromJson(
    json['staffStatus'] as String,
  ),
  queueReasons: (json['queueReasons'] as List<dynamic>)
      .map((e) => AdminTrustCardDtoQueueReasons.fromJson(e as String))
      .toList(),
  missing: (json['missing'] as List<dynamic>)
      .map((e) => AdminTrustCardDtoMissing.fromJson(e as String))
      .toList(),
  requirements: TrustRequirementsDto.fromJson(
    json['requirements'] as Map<String, dynamic>,
  ),
  documentsRequestedAt: json['documentsRequestedAt'] == null
      ? null
      : DateTime.parse(json['documentsRequestedAt'] as String),
  documentsRequestedTemplate: json['documentsRequestedTemplate'] as String?,
  stripeLegalName: json['stripeLegalName'] as String?,
  stripeBusinessType: json['stripeBusinessType'] as String?,
  stripeCompanyName: json['stripeCompanyName'] as String?,
  stripeCompanyDomain: json['stripeCompanyDomain'] as String?,
  stripeRepresentative: json['stripeRepresentative'] as String?,
  firmLink: FirmLinkDto.fromJson(json['firmLink'] as Map<String, dynamic>),
  firmLinkNote: json['firmLinkNote'] as String?,
  payoutDelayDays: (json['payoutDelayDays'] as num?)?.toInt(),
  complaintsTotal: (json['complaintsTotal'] as num).toInt(),
  duplicateClaims: (json['duplicateClaims'] as num).toInt(),
  registryLinks: (json['registryLinks'] as List<dynamic>)
      .map((e) => RegistryLinkDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  lookups: (json['lookups'] as List<dynamic>)
      .map((e) => BarLookupDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  blocked: json['blocked'] as bool,
  latestRequestId: json['latestRequestId'] as String?,
  events: (json['events'] as List<dynamic>)
      .map((e) => TrustEventDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AdminTrustCardDtoToJson(AdminTrustCardDto instance) =>
    <String, dynamic>{
      'attorney': instance.attorney.toJson(),
      'level': instance.level,
      'badgeStatus': instance.badgeStatus.toJson(),
      'badge': instance.badge,
      'signals': instance.signals.toJson(),
      'holds': instance.holds.toJson(),
      'bidsGate': instance.bidsGate.toJson(),
      'paymentsGate': instance.paymentsGate.toJson(),
      'cleared': instance.cleared,
      'clearedBy': ?instance.clearedBy?.toJson(),
      'staffClearedAt': ?instance.staffClearedAt?.toIso8601String(),
      'staffClearedBy': ?instance.staffClearedBy?.toJson(),
      'staffStatus': instance.staffStatus.toJson(),
      'queueReasons': instance.queueReasons.map((e) => e.toJson()).toList(),
      'missing': instance.missing.map((e) => e.toJson()).toList(),
      'requirements': instance.requirements.toJson(),
      'documentsRequestedAt': ?instance.documentsRequestedAt?.toIso8601String(),
      'documentsRequestedTemplate': ?instance.documentsRequestedTemplate,
      'stripeLegalName': ?instance.stripeLegalName,
      'stripeBusinessType': ?instance.stripeBusinessType,
      'stripeCompanyName': ?instance.stripeCompanyName,
      'stripeCompanyDomain': ?instance.stripeCompanyDomain,
      'stripeRepresentative': ?instance.stripeRepresentative,
      'firmLink': instance.firmLink.toJson(),
      'firmLinkNote': ?instance.firmLinkNote,
      'payoutDelayDays': ?instance.payoutDelayDays,
      'complaintsTotal': instance.complaintsTotal,
      'duplicateClaims': instance.duplicateClaims,
      'registryLinks': instance.registryLinks.map((e) => e.toJson()).toList(),
      'lookups': instance.lookups.map((e) => e.toJson()).toList(),
      'blocked': instance.blocked,
      'latestRequestId': ?instance.latestRequestId,
      'events': instance.events.map((e) => e.toJson()).toList(),
    };
