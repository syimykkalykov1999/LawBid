// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_trust_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTrustCardDto _$AdminTrustCardDtoFromJson(Map<String, dynamic> json) =>
    AdminTrustCardDto(
      attorney: AdminTrustAttorneyDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
      level: (json['level'] as num).toInt(),
      badge: json['badge'] as bool,
      signals: TrustSignalsDto.fromJson(
        json['signals'] as Map<String, dynamic>,
      ),
      holds: TrustHoldsDto.fromJson(json['holds'] as Map<String, dynamic>),
      bidsGate: TrustGateDto.fromJson(json['bidsGate'] as Map<String, dynamic>),
      paymentsGate: TrustGateDto.fromJson(
        json['paymentsGate'] as Map<String, dynamic>,
      ),
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
      latestRequestId: json['latestRequestId'] as String?,
      events: (json['events'] as List<dynamic>)
          .map((e) => TrustEventDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AdminTrustCardDtoToJson(AdminTrustCardDto instance) =>
    <String, dynamic>{
      'attorney': instance.attorney.toJson(),
      'level': instance.level,
      'badge': instance.badge,
      'signals': instance.signals.toJson(),
      'holds': instance.holds.toJson(),
      'bidsGate': instance.bidsGate.toJson(),
      'paymentsGate': instance.paymentsGate.toJson(),
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
      'latestRequestId': ?instance.latestRequestId,
      'events': instance.events.map((e) => e.toJson()).toList(),
    };
