// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_bucket_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineBucketRowDto _$HotlineBucketRowDtoFromJson(Map<String, dynamic> json) =>
    HotlineBucketRowDto(
      bucket: json['bucket'] as String,
      lawyers: json['lawyers'] as num,
      waiting: json['waiting'] as num,
    );

Map<String, dynamic> _$HotlineBucketRowDtoToJson(
  HotlineBucketRowDto instance,
) => <String, dynamic>{
  'bucket': instance.bucket,
  'lawyers': instance.lawyers,
  'waiting': instance.waiting,
};
