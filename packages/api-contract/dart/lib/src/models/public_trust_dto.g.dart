// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_trust_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicTrustDto _$PublicTrustDtoFromJson(Map<String, dynamic> json) =>
    PublicTrustDto(
      attorneyId: json['attorneyId'] as String,
      level: (json['level'] as num).toInt(),
      badge: json['badge'] as bool,
      cleared: json['cleared'] as bool,
      signals: TrustSignalsDto.fromJson(
        json['signals'] as Map<String, dynamic>,
      ),
      acceptsPayments: json['acceptsPayments'] as bool,
      canBid: json['canBid'] as bool,
      registryLinks: (json['registryLinks'] as List<dynamic>)
          .map((e) => RegistryLinkDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PublicTrustDtoToJson(PublicTrustDto instance) =>
    <String, dynamic>{
      'attorneyId': instance.attorneyId,
      'level': instance.level,
      'badge': instance.badge,
      'cleared': instance.cleared,
      'signals': instance.signals.toJson(),
      'acceptsPayments': instance.acceptsPayments,
      'canBid': instance.canBid,
      'registryLinks': instance.registryLinks.map((e) => e.toJson()).toList(),
    };
