// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_queue_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustQueueItemDto _$TrustQueueItemDtoFromJson(Map<String, dynamic> json) =>
    TrustQueueItemDto(
      attorney: AdminTrustAttorneyDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
      level: (json['level'] as num).toInt(),
      reasons: (json['reasons'] as List<dynamic>)
          .map((e) => TrustQueueItemDtoReasons.fromJson(e as String))
          .toList(),
      missing: (json['missing'] as List<dynamic>)
          .map((e) => TrustQueueItemDtoMissing.fromJson(e as String))
          .toList(),
      signals: TrustSignalsDto.fromJson(
        json['signals'] as Map<String, dynamic>,
      ),
      holds: TrustHoldsDto.fromJson(json['holds'] as Map<String, dynamic>),
      stripeBusinessType: json['stripeBusinessType'] as String?,
      stripeRepresentative: json['stripeRepresentative'] as String?,
      stripeCompanyName: json['stripeCompanyName'] as String?,
      registryLinks: (json['registryLinks'] as List<dynamic>)
          .map((e) => RegistryLinkDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      lookups: (json['lookups'] as List<dynamic>)
          .map((e) => BarLookupDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      blocked: json['blocked'] as bool,
      requestId: json['requestId'] as String?,
      documentsCount: (json['documentsCount'] as num).toInt(),
      documentsRequestedAt: json['documentsRequestedAt'] == null
          ? null
          : DateTime.parse(json['documentsRequestedAt'] as String),
      waitingSince: json['waitingSince'] == null
          ? null
          : DateTime.parse(json['waitingSince'] as String),
      badgeStatus: TrustQueueItemDtoBadgeStatus.fromJson(
        json['badgeStatus'] as String,
      ),
    );

Map<String, dynamic> _$TrustQueueItemDtoToJson(TrustQueueItemDto instance) =>
    <String, dynamic>{
      'attorney': instance.attorney.toJson(),
      'level': instance.level,
      'reasons': instance.reasons.map((e) => e.toJson()).toList(),
      'missing': instance.missing.map((e) => e.toJson()).toList(),
      'signals': instance.signals.toJson(),
      'holds': instance.holds.toJson(),
      'stripeBusinessType': ?instance.stripeBusinessType,
      'stripeRepresentative': ?instance.stripeRepresentative,
      'stripeCompanyName': ?instance.stripeCompanyName,
      'registryLinks': instance.registryLinks.map((e) => e.toJson()).toList(),
      'lookups': instance.lookups.map((e) => e.toJson()).toList(),
      'blocked': instance.blocked,
      'requestId': ?instance.requestId,
      'documentsCount': instance.documentsCount,
      'documentsRequestedAt': ?instance.documentsRequestedAt?.toIso8601String(),
      'waitingSince': ?instance.waitingSince?.toIso8601String(),
      'badgeStatus': instance.badgeStatus.toJson(),
    };
