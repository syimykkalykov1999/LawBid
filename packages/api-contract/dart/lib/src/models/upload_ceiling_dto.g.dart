// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_ceiling_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadCeilingDto _$UploadCeilingDtoFromJson(Map<String, dynamic> json) =>
    UploadCeilingDto(
      count: json['count'] as num,
      fileMb: json['fileMb'] as num,
      totalMb: json['totalMb'] as num,
    );

Map<String, dynamic> _$UploadCeilingDtoToJson(UploadCeilingDto instance) =>
    <String, dynamic>{
      'count': instance.count,
      'fileMb': instance.fileMb,
      'totalMb': instance.totalMb,
    };
