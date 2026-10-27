// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lease_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LeaseDto _$LeaseDtoFromJson(Map<String, dynamic> json) => LeaseDto(
  kind: LeaseQueueKind.fromJson(json['kind'] as String),
  itemId: json['itemId'] as String,
  takenAt: DateTime.parse(json['takenAt'] as String),
  leasedUntil: DateTime.parse(json['leasedUntil'] as String),
  attempt: json['attempt'] as num,
);

Map<String, dynamic> _$LeaseDtoToJson(LeaseDto instance) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'itemId': instance.itemId,
  'takenAt': instance.takenAt.toIso8601String(),
  'leasedUntil': instance.leasedUntil.toIso8601String(),
  'attempt': instance.attempt,
};
