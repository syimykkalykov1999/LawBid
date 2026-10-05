// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fingerprint_kind.dart';
import 'fraud_actor_type.dart';
import 'fraud_event_kind.dart';

part 'fraud_event_dto.g.dart';

@JsonSerializable()
class FraudEventDto {
  const FraudEventDto({
    required this.id,
    required this.userId,
    required this.userName,
    required this.kind,
    required this.actorType,
    required this.actorId,
    required this.actorName,
    required this.note,
    required this.score,
    required this.kinds,
    required this.createdAt,
  });

  factory FraudEventDto.fromJson(Map<String, Object?> json) =>
      _$FraudEventDtoFromJson(json);

  final String id;
  final String? userId;
  final String? userName;
  final FraudEventKind kind;
  final FraudActorType actorType;
  final String? actorId;
  final String? actorName;
  final String? note;
  final num? score;

  /// Signals a refused sign-in matched.
  final List<FingerprintKind> kinds;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$FraudEventDtoToJson(this);
}
