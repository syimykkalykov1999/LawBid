// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_contact_hashes_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadContactHashesDto _$UploadContactHashesDtoFromJson(
  Map<String, dynamic> json,
) => UploadContactHashesDto(
  hashes: (json['hashes'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$UploadContactHashesDtoToJson(
  UploadContactHashesDto instance,
) => <String, dynamic>{'hashes': instance.hashes};
