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
    );

Map<String, dynamic> _$AttachDocumentDtoToJson(AttachDocumentDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'docType': instance.docType.toJson(),
      'side': ?instance.side?.toJson(),
      'stateCode': ?instance.stateCode,
    };
