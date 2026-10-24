// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_skipped_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuSkippedDto _$SfuSkippedDtoFromJson(Map<String, dynamic> json) =>
    SfuSkippedDto(
      userId: json['userId'] as String,
      trackName: json['trackName'] as String,
      reason: json['reason'] as String,
    );

Map<String, dynamic> _$SfuSkippedDtoToJson(SfuSkippedDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'trackName': instance.trackName,
      'reason': instance.reason,
    };
