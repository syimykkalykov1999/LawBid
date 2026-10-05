// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_dossier_dto.g.dart';

@JsonSerializable()
class CaseDossierDto {
  const CaseDossierDto({
    required this.imagesCount,
    required this.documentsCount,
    required this.descriptionLength,
  });

  factory CaseDossierDto.fromJson(Map<String, Object?> json) =>
      _$CaseDossierDtoFromJson(json);

  /// Attached photos (image/*).
  final int imagesCount;

  /// Attached documents (PDF, Word…).
  final int documentsCount;

  /// Length of the full description, in characters.
  final int descriptionLength;

  Map<String, Object?> toJson() => _$CaseDossierDtoToJson(this);
}
