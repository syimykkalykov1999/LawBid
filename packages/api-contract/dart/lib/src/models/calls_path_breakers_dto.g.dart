// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calls_path_breakers_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallsPathBreakersDto _$CallsPathBreakersDtoFromJson(
  Map<String, dynamic> json,
) => CallsPathBreakersDto(
  turn: CallsPathBreakersDtoTurn.fromJson(json['turn'] as String),
  sfu: CallsPathBreakersDtoSfu.fromJson(json['sfu'] as String),
);

Map<String, dynamic> _$CallsPathBreakersDtoToJson(
  CallsPathBreakersDto instance,
) => <String, dynamic>{
  'turn': instance.turn.toJson(),
  'sfu': instance.sfu.toJson(),
};
