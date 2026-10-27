// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'minor_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MinorRowDto _$MinorRowDtoFromJson(Map<String, dynamic> json) => MinorRowDto(
  userId: json['userId'] as String,
  status: json['status'] as String,
  birthDate: json['birthDate'] as String?,
  flaggedAt: json['flaggedAt'] as String?,
  flagReason: json['flagReason'] as String?,
  attestedAt: json['attestedAt'] as String,
  textVersion: json['textVersion'] as String,
);

Map<String, dynamic> _$MinorRowDtoToJson(MinorRowDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'status': instance.status,
      'birthDate': ?instance.birthDate,
      'flaggedAt': ?instance.flaggedAt,
      'flagReason': ?instance.flagReason,
      'attestedAt': instance.attestedAt,
      'textVersion': instance.textVersion,
    };
