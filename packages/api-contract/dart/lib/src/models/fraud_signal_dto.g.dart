// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_signal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudSignalDto _$FraudSignalDtoFromJson(Map<String, dynamic> json) =>
    FraudSignalDto(
      code: FraudSignalCode.fromJson(json['code'] as String),
      count: json['count'] as num,
      points: json['points'] as num,
    );

Map<String, dynamic> _$FraudSignalDtoToJson(FraudSignalDto instance) =>
    <String, dynamic>{
      'code': instance.code.toJson(),
      'count': instance.count,
      'points': instance.points,
    };
