// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'own_trust_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnTrustDto _$OwnTrustDtoFromJson(Map<String, dynamic> json) => OwnTrustDto(
  attorneyId: json['attorneyId'] as String,
  level: (json['level'] as num).toInt(),
  badge: json['badge'] as bool,
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
  badgeLevel: (json['badgeLevel'] as num).toInt(),
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
      'signals': instance.signals.toJson(),
      'acceptsPayments': instance.acceptsPayments,
      'canBid': instance.canBid,
      'registryLinks': instance.registryLinks.map((e) => e.toJson()).toList(),
      'bidsGate': instance.bidsGate.toJson(),
      'paymentsGate': instance.paymentsGate.toJson(),
      'badgeLevel': instance.badgeLevel,
      'payoutDelayDays': ?instance.payoutDelayDays,
      'nextSteps': instance.nextSteps,
      'firmLink': instance.firmLink.toJson(),
      'stripeBusinessType': ?instance.stripeBusinessType,
    };
