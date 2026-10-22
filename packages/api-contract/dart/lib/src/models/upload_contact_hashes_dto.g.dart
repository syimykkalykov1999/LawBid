// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_contact_hashes_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadContactHashesDto _$UploadContactHashesDtoFromJson(
  Map<String, dynamic> json,
) => UploadContactHashesDto(
  hashes: (json['hashes'] as List<dynamic>?)?.map((e) => e as String).toList(),
  full: json['full'] as bool?,
  added: (json['added'] as List<dynamic>?)?.map((e) => e as String).toList(),
  removed: (json['removed'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  baseHash: json['baseHash'] as String?,
  bookHash: json['bookHash'] as String?,
  matchesVersion: (json['matchesVersion'] as num?)?.toInt(),
);

Map<String, dynamic> _$UploadContactHashesDtoToJson(
  UploadContactHashesDto instance,
) => <String, dynamic>{
  'hashes': ?instance.hashes,
  'full': ?instance.full,
  'added': ?instance.added,
  'removed': ?instance.removed,
  'baseHash': ?instance.baseHash,
  'bookHash': ?instance.bookHash,
  'matchesVersion': ?instance.matchesVersion,
};
