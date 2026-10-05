// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'document_request_dto_template.dart';

part 'document_request_dto.g.dart';

@JsonSerializable()
class DocumentRequestDto {
  const DocumentRequestDto({required this.template, this.note});

  factory DocumentRequestDto.fromJson(Map<String, Object?> json) =>
      _$DocumentRequestDtoFromJson(json);

  final DocumentRequestDtoTemplate template;
  final String? note;

  Map<String, Object?> toJson() => _$DocumentRequestDtoToJson(this);
}
