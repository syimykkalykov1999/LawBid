// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_locale_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalLocaleStateDto _$AdminLegalLocaleStateDtoFromJson(
  Map<String, dynamic> json,
) => AdminLegalLocaleStateDto(
  locale: AdminLegalLocaleStateDtoLocale.fromJson(json['locale'] as String),
  currentVersion: json['currentVersion'] as String?,
  publishedAt: json['publishedAt'] == null
      ? null
      : DateTime.parse(json['publishedAt'] as String),
  hasDraft: json['hasDraft'] as bool,
  draftUpdatedAt: json['draftUpdatedAt'] == null
      ? null
      : DateTime.parse(json['draftUpdatedAt'] as String),
  state: AdminLegalLocaleStateDtoState.fromJson(json['state'] as String),
);

Map<String, dynamic> _$AdminLegalLocaleStateDtoToJson(
  AdminLegalLocaleStateDto instance,
) => <String, dynamic>{
  'locale': instance.locale.toJson(),
  'currentVersion': ?instance.currentVersion,
  'publishedAt': ?instance.publishedAt?.toIso8601String(),
  'hasDraft': instance.hasDraft,
  'draftUpdatedAt': ?instance.draftUpdatedAt?.toIso8601String(),
  'state': instance.state.toJson(),
};
