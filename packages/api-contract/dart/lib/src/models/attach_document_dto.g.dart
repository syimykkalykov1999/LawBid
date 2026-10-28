// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attach_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttachDocumentDto _$AttachDocumentDtoFromJson(Map<String, dynamic> json) =>
    AttachDocumentDto(
      fileId: json['fileId'] as String,
      docType: VerificationDocType.fromJson(json['docType'] as String),
      side: json['side'] == null
          ? null
          : AttachDocumentDtoSide.fromJson(json['side'] as String),
      stateCode: json['stateCode'] as String?,
      note: json['note'] as String?,
      captureToken: json['captureToken'] as String?,
      captureMeta: json['captureMeta'] == null
          ? null
          : SelfieCaptureMetaDto.fromJson(
              json['captureMeta'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$AttachDocumentDtoToJson(AttachDocumentDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'docType': instance.docType.toJson(),
      'side': ?instance.side?.toJson(),
      'stateCode': ?instance.stateCode,
      'note': ?instance.note,
      'captureToken': ?instance.captureToken,
      'captureMeta': ?instance.captureMeta?.toJson(),
    };
