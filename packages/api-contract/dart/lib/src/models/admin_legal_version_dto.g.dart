// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_version_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalVersionDto _$AdminLegalVersionDtoFromJson(
  Map<String, dynamic> json,
) => AdminLegalVersionDto(
  id: json['id'] as String,
  docType: AdminLegalVersionDtoDocType.fromJson(json['docType'] as String),
  locale: AdminLegalVersionDtoLocale.fromJson(json['locale'] as String),
  version: json['version'] as String,
  status: AdminLegalVersionDtoStatus.fromJson(json['status'] as String),
  isCurrent: json['isCurrent'] as bool,
  requiresReacceptance: json['requiresReacceptance'] as bool,
  publishedAt: json['publishedAt'] == null
      ? null
      : DateTime.parse(json['publishedAt'] as String),
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  changeNote: json['changeNote'] as String?,
  changedBy: json['changedBy'] as String?,
  changedByName: json['changedByName'] as String?,
  rollbackOfId: json['rollbackOfId'] as String?,
  consents: json['consents'] as num,
  length: (json['length'] as num).toInt(),
  contentMd: json['contentMd'] as String?,
);

Map<String, dynamic> _$AdminLegalVersionDtoToJson(
  AdminLegalVersionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'docType': instance.docType.toJson(),
  'locale': instance.locale.toJson(),
  'version': instance.version,
  'status': instance.status.toJson(),
  'isCurrent': instance.isCurrent,
  'requiresReacceptance': instance.requiresReacceptance,
  'publishedAt': ?instance.publishedAt?.toIso8601String(),
  'updatedAt': instance.updatedAt.toIso8601String(),
  'changeNote': ?instance.changeNote,
  'changedBy': ?instance.changedBy,
  'changedByName': ?instance.changedByName,
  'rollbackOfId': ?instance.rollbackOfId,
  'consents': instance.consents,
  'length': instance.length,
  'contentMd': ?instance.contentMd,
};
