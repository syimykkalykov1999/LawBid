// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'save_legal_draft_dto.g.dart';

@JsonSerializable()
class SaveLegalDraftDto {
  const SaveLegalDraftDto({required this.contentMd, this.changeNote});

  factory SaveLegalDraftDto.fromJson(Map<String, Object?> json) =>
      _$SaveLegalDraftDtoFromJson(json);

  /// Markdown.
  final String contentMd;
  final String? changeNote;

  Map<String, Object?> toJson() => _$SaveLegalDraftDtoToJson(this);
}
