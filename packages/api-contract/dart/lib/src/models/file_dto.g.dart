// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'file_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FileDto _$FileDtoFromJson(Map<String, dynamic> json) => FileDto(
  id: json['id'] as String,
  purpose: FilePurpose.fromJson(json['purpose'] as String),
  mime: json['mime'] as String,
  sizeBytes: json['sizeBytes'] as num,
  width: json['width'] as num?,
  height: json['height'] as num?,
  scanStatus: ScanStatus.fromJson(json['scanStatus'] as String),
  url: json['url'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$FileDtoToJson(FileDto instance) => <String, dynamic>{
  'id': instance.id,
  'purpose': instance.purpose.toJson(),
  'mime': instance.mime,
  'sizeBytes': instance.sizeBytes,
  'width': ?instance.width,
  'height': ?instance.height,
  'scanStatus': instance.scanStatus.toJson(),
  'url': ?instance.url,
  'createdAt': instance.createdAt.toIso8601String(),
};
