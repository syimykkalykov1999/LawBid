// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_data_request_intake_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateDataRequestIntakeDto _$UpdateDataRequestIntakeDtoFromJson(
  Map<String, dynamic> json,
) => UpdateDataRequestIntakeDto(
  legalBasis: json['legalBasis'] as String?,
  dueAt: json['dueAt'] == null ? null : DateTime.parse(json['dueAt'] as String),
  subjectUserId: json['subjectUserId'] as String?,
  doNotNotify: json['doNotNotify'] as bool?,
  nondisclosureUntil: json['nondisclosureUntil'] == null
      ? null
      : DateTime.parse(json['nondisclosureUntil'] as String),
);

Map<String, dynamic> _$UpdateDataRequestIntakeDtoToJson(
  UpdateDataRequestIntakeDto instance,
) => <String, dynamic>{
  'legalBasis': ?instance.legalBasis,
  'dueAt': ?instance.dueAt?.toIso8601String(),
  'subjectUserId': ?instance.subjectUserId,
  'doNotNotify': ?instance.doNotNotify,
  'nondisclosureUntil': ?instance.nondisclosureUntil?.toIso8601String(),
};
