// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_export_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalExportDto _$LegalExportDtoFromJson(Map<String, dynamic> json) =>
    LegalExportDto(
      id: json['id'] as String,
      requestId: json['requestId'] as String,
      subjectUserId: json['subjectUserId'] as String,
      requestedBy: json['requestedBy'] as String,
      status: json['status'] as String,
      selection: json['selection'],
      rowCounts: (json['rowCounts'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, e as num),
      ),
      sizeBytes: json['sizeBytes'] as num?,
      sha256: json['sha256'] as String?,
      manifestSha256: json['manifestSha256'] as String?,
      manifestSignature: json['manifestSignature'] as String?,
      signatureAlg: json['signatureAlg'] as String?,
      downloadCount: (json['downloadCount'] as num).toInt(),
      lastDownloadedAt: json['lastDownloadedAt'] as String?,
      error: json['error'] as String?,
      createdAt: json['createdAt'] as String,
      finishedAt: json['finishedAt'] as String?,
      expiresAt: json['expiresAt'] as String?,
    );

Map<String, dynamic> _$LegalExportDtoToJson(LegalExportDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'requestId': instance.requestId,
      'subjectUserId': instance.subjectUserId,
      'requestedBy': instance.requestedBy,
      'status': instance.status,
      'selection': ?instance.selection,
      'rowCounts': ?instance.rowCounts,
      'sizeBytes': ?instance.sizeBytes,
      'sha256': ?instance.sha256,
      'manifestSha256': ?instance.manifestSha256,
      'manifestSignature': ?instance.manifestSignature,
      'signatureAlg': ?instance.signatureAlg,
      'downloadCount': instance.downloadCount,
      'lastDownloadedAt': ?instance.lastDownloadedAt,
      'error': ?instance.error,
      'createdAt': instance.createdAt,
      'finishedAt': ?instance.finishedAt,
      'expiresAt': ?instance.expiresAt,
    };
