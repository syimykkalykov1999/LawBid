// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_publish_failed_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuPublishFailedDto _$SfuPublishFailedDtoFromJson(Map<String, dynamic> json) =>
    SfuPublishFailedDto(
      trackName: json['trackName'] as String,
      errorCode: json['errorCode'] as String,
    );

Map<String, dynamic> _$SfuPublishFailedDtoToJson(
  SfuPublishFailedDto instance,
) => <String, dynamic>{
  'trackName': instance.trackName,
  'errorCode': instance.errorCode,
};
