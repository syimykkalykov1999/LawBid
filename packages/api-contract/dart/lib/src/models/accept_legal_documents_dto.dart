// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'accept_legal_documents_dto.g.dart';

@JsonSerializable()
class AcceptLegalDocumentsDto {
  const AcceptLegalDocumentsDto({required this.documentIds, this.deviceId});

  factory AcceptLegalDocumentsDto.fromJson(Map<String, Object?> json) =>
      _$AcceptLegalDocumentsDtoFromJson(json);

  /// Ids of the current versions the user ticked.
  final List<String> documentIds;
  final String? deviceId;

  Map<String, Object?> toJson() => _$AcceptLegalDocumentsDtoToJson(this);
}
