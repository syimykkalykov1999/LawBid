// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'end_call_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EndCallDto _$EndCallDtoFromJson(Map<String, dynamic> json) => EndCallDto(
  reason: json['reason'] == null
      ? null
      : CallEndReason.fromJson(json['reason'] as String),
  forAll: json['forAll'] as bool?,
);

Map<String, dynamic> _$EndCallDtoToJson(EndCallDto instance) =>
    <String, dynamic>{
      'reason': ?instance.reason?.toJson(),
      'forAll': ?instance.forAll,
    };
