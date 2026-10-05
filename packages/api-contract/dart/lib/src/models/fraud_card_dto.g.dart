// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudCardDto _$FraudCardDtoFromJson(Map<String, dynamic> json) => FraudCardDto(
  user: FraudUserDto.fromJson(json['user'] as Map<String, dynamic>),
  score: json['score'] as num,
  status: FraudStatus.fromJson(json['status'] as String),
  queueReason: json['queueReason'] == null
      ? null
      : FraudCardDtoQueueReason.fromJson(json['queueReason'] as String),
  queuedAt: json['queuedAt'] == null
      ? null
      : DateTime.parse(json['queuedAt'] as String),
  signals: (json['signals'] as List<dynamic>)
      .map((e) => FraudSignalDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  linkedUserId: json['linkedUserId'] as String?,
  computedAt: DateTime.parse(json['computedAt'] as String),
  linked: (json['linked'] as List<dynamic>)
      .map((e) => FraudLinkedAccountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  events: (json['events'] as List<dynamic>)
      .map((e) => FraudEventDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  clearedScore: json['clearedScore'] as num?,
  clearedAt: json['clearedAt'] == null
      ? null
      : DateTime.parse(json['clearedAt'] as String),
);

Map<String, dynamic> _$FraudCardDtoToJson(FraudCardDto instance) =>
    <String, dynamic>{
      'user': instance.user.toJson(),
      'score': instance.score,
      'status': instance.status.toJson(),
      'queueReason': ?instance.queueReason?.toJson(),
      'queuedAt': ?instance.queuedAt?.toIso8601String(),
      'signals': instance.signals.map((e) => e.toJson()).toList(),
      'linkedUserId': ?instance.linkedUserId,
      'computedAt': instance.computedAt.toIso8601String(),
      'linked': instance.linked.map((e) => e.toJson()).toList(),
      'events': instance.events.map((e) => e.toJson()).toList(),
      'clearedScore': ?instance.clearedScore,
      'clearedAt': ?instance.clearedAt?.toIso8601String(),
    };
