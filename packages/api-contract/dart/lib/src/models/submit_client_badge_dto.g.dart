// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'submit_client_badge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SubmitClientBadgeDto _$SubmitClientBadgeDtoFromJson(
  Map<String, dynamic> json,
) => SubmitClientBadgeDto(
  fileIds: (json['fileIds'] as List<dynamic>).map((e) => e as String).toList(),
  note: json['note'] as String?,
);

Map<String, dynamic> _$SubmitClientBadgeDtoToJson(
  SubmitClientBadgeDto instance,
) => <String, dynamic>{'fileIds': instance.fileIds, 'note': ?instance.note};
