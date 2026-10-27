// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'progress.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Progress _$ProgressFromJson(Map<String, dynamic> json) => Progress(
  rows: (json['rows'] as num?)?.toInt(),
  bytes: (json['bytes'] as num?)?.toInt(),
);

Map<String, dynamic> _$ProgressToJson(Progress instance) => <String, dynamic>{
  'rows': ?instance.rows,
  'bytes': ?instance.bytes,
};
