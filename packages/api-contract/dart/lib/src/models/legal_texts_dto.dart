// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_texts_dto.g.dart';

@JsonSerializable()
class LegalTextsDto {
  const LegalTextsDto({
    required this.caseCreate,
    required this.attorneyUnverified,
    required this.supportNote,
    required this.partnerDisclosure,
    required this.partnerTerms,
  });

  factory LegalTextsDto.fromJson(Map<String, Object?> json) =>
      _$LegalTextsDtoFromJson(json);

  final String caseCreate;
  final String attorneyUnverified;
  final String supportNote;
  final String partnerDisclosure;

  /// Plain text (no markdown), numbered rules.
  final String partnerTerms;

  Map<String, Object?> toJson() => _$LegalTextsDtoToJson(this);
}
