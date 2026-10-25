// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'minor_confirmed_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MinorConfirmedDto _$MinorConfirmedDtoFromJson(Map<String, dynamic> json) =>
    MinorConfirmedDto(
      userId: json['userId'] as String,
      outcome: MinorConfirmedOutcome.fromJson(json['outcome'] as String),
    );

Map<String, dynamic> _$MinorConfirmedDtoToJson(MinorConfirmedDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'outcome': instance.outcome.toJson(),
    };
