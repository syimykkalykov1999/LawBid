// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'own_trust_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnTrustDto _$OwnTrustDtoFromJson(Map<String, dynamic> json) => OwnTrustDto(
  attorneyId: json['attorneyId'] as String,
  level: (json['level'] as num).toInt(),
  badge: json['badge'] as bool,
  cleared: json['cleared'] as bool,
  signals: TrustSignalsDto.fromJson(json['signals'] as Map<String, dynamic>),
  acceptsPayments: json['acceptsPayments'] as bool,
  canBid: json['canBid'] as bool,
  registryLinks: (json['registryLinks'] as List<dynamic>)
      .map((e) => RegistryLinkDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  bidsGate: TrustGateDto.fromJson(json['bidsGate'] as Map<String, dynamic>),
  paymentsGate: TrustGateDto.fromJson(
    json['paymentsGate'] as Map<String, dynamic>,
  ),
  requirements: TrustRequirementsDto.fromJson(
    json['requirements'] as Map<String, dynamic>,
  ),
  missing: (json['missing'] as List<dynamic>)
      .map((e) => OwnTrustDtoMissing.fromJson(e as String))
      .toList(),
  staffStatus: OwnTrustDtoStaffStatus.fromJson(json['staffStatus'] as String),
  documentsRequested: json['documentsRequested'] == null
      ? null
      : OwnTrustDtoDocumentsRequested.fromJson(
          json['documentsRequested'] as String,
        ),
  payoutDelayDays: (json['payoutDelayDays'] as num?)?.toInt(),
  nextSteps: (json['nextSteps'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  firmLink: FirmLinkDto.fromJson(json['firmLink'] as Map<String, dynamic>),
  stripeBusinessType: json['stripeBusinessType'] as String?,
);

Map<String, dynamic> _$OwnTrustDtoToJson(OwnTrustDto instance) =>
    <String, dynamic>{
      'attorneyId': instance.attorneyId,
      'level': instance.level,
      'badge': instance.badge,
      'cleared': instance.cleared,
      'signals': instance.signals.toJson(),
      'acceptsPayments': instance.acceptsPayments,
      'canBid': instance.canBid,
      'registryLinks': instance.registryLinks.map((e) => e.toJson()).toList(),
      'bidsGate': instance.bidsGate.toJson(),
      'paymentsGate': instance.paymentsGate.toJson(),
      'requirements': instance.requirements.toJson(),
      'missing': instance.missing.map((e) => e.toJson()).toList(),
      'staffStatus': instance.staffStatus.toJson(),
      'documentsRequested': ?instance.documentsRequested?.toJson(),
      'payoutDelayDays': ?instance.payoutDelayDays,
      'nextSteps': instance.nextSteps,
      'firmLink': instance.firmLink.toJson(),
      'stripeBusinessType': ?instance.stripeBusinessType,
    };
