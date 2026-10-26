// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'no_show_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NoShowDto _$NoShowDtoFromJson(Map<String, dynamic> json) => NoShowDto(
  id: json['id'] as String,
  absentSide: NoShowDtoAbsentSide.fromJson(json['absentSide'] as String),
  state: NoShowDtoState.fromJson(json['state'] as String),
  source: NoShowDtoSource.fromJson(json['source'] as String),
  markedAt: json['markedAt'] as String,
  disputeUntil: json['disputeUntil'] as String,
  viewerIsAbsent: json['viewerIsAbsent'] as bool,
  canDispute: json['canDispute'] as bool,
  canWithdraw: json['canWithdraw'] as bool,
  disputeReason: json['disputeReason'] as String?,
);

Map<String, dynamic> _$NoShowDtoToJson(NoShowDto instance) => <String, dynamic>{
  'id': instance.id,
  'absentSide': instance.absentSide.toJson(),
  'state': instance.state.toJson(),
  'source': instance.source.toJson(),
  'markedAt': instance.markedAt,
  'disputeUntil': instance.disputeUntil,
  'disputeReason': ?instance.disputeReason,
  'viewerIsAbsent': instance.viewerIsAbsent,
  'canDispute': instance.canDispute,
  'canWithdraw': instance.canWithdraw,
};
