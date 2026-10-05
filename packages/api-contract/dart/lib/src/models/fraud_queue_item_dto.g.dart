// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_queue_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudQueueItemDto _$FraudQueueItemDtoFromJson(Map<String, dynamic> json) =>
    FraudQueueItemDto(
      user: FraudUserDto.fromJson(json['user'] as Map<String, dynamic>),
      score: json['score'] as num,
      status: FraudStatus.fromJson(json['status'] as String),
      queueReason: json['queueReason'] == null
          ? null
          : FraudQueueItemDtoQueueReason.fromJson(
              json['queueReason'] as String,
            ),
      queuedAt: json['queuedAt'] == null
          ? null
          : DateTime.parse(json['queuedAt'] as String),
      signals: (json['signals'] as List<dynamic>)
          .map((e) => FraudSignalDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      linkedUserId: json['linkedUserId'] as String?,
      computedAt: DateTime.parse(json['computedAt'] as String),
    );

Map<String, dynamic> _$FraudQueueItemDtoToJson(FraudQueueItemDto instance) =>
    <String, dynamic>{
      'user': instance.user.toJson(),
      'score': instance.score,
      'status': instance.status.toJson(),
      'queueReason': ?instance.queueReason?.toJson(),
      'queuedAt': ?instance.queuedAt?.toIso8601String(),
      'signals': instance.signals.map((e) => e.toJson()).toList(),
      'linkedUserId': ?instance.linkedUserId,
      'computedAt': instance.computedAt.toIso8601String(),
    };
