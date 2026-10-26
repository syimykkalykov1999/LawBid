// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'built_document_dto.g.dart';

@JsonSerializable()
class BuiltDocumentDto {
  const BuiltDocumentDto({
    required this.fileId,
    required this.title,
    required this.url,
  });

  factory BuiltDocumentDto.fromJson(Map<String, Object?> json) =>
      _$BuiltDocumentDtoFromJson(json);

  final String fileId;
  final String title;
  final String? url;

  Map<String, Object?> toJson() => _$BuiltDocumentDtoToJson(this);
}
