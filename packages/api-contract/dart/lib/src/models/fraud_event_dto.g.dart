// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudEventDto _$FraudEventDtoFromJson(Map<String, dynamic> json) =>
    FraudEventDto(
      id: json['id'] as String,
      userId: json['userId'] as String?,
      userName: json['userName'] as String?,
      kind: FraudEventKind.fromJson(json['kind'] as String),
      actorType: FraudActorType.fromJson(json['actorType'] as String),
      actorId: json['actorId'] as String?,
      actorName: json['actorName'] as String?,
      note: json['note'] as String?,
      score: json['score'] as num?,
      kinds: (json['kinds'] as List<dynamic>)
          .map((e) => FingerprintKind.fromJson(e as String))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$FraudEventDtoToJson(FraudEventDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': ?instance.userId,
      'userName': ?instance.userName,
      'kind': instance.kind.toJson(),
      'actorType': instance.actorType.toJson(),
      'actorId': ?instance.actorId,
      'actorName': ?instance.actorName,
      'note': ?instance.note,
      'score': ?instance.score,
      'kinds': instance.kinds.map((e) => e.toJson()).toList(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
