// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDocumentDto _$AdminDocumentDtoFromJson(Map<String, dynamic> json) =>
    AdminDocumentDto(
      id: json['id'] as String,
      docType: VerificationDocType.fromJson(json['docType'] as String),
      side: json['side'] == null
          ? null
          : AdminDocumentDtoSide.fromJson(json['side'] as String),
      stateCode: json['stateCode'] as String?,
      mime: json['mime'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      scanStatus: ScanStatus.fromJson(json['scanStatus'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminDocumentDtoToJson(AdminDocumentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'docType': instance.docType.toJson(),
      'side': ?instance.side?.toJson(),
      'stateCode': ?instance.stateCode,
      'mime': instance.mime,
      'sizeBytes': instance.sizeBytes,
      'scanStatus': instance.scanStatus.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
