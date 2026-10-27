// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_disclaimer_dto_kind.dart';

part 'legal_disclaimer_dto.g.dart';

@JsonSerializable()
class LegalDisclaimerDto {
  const LegalDisclaimerDto({
    required this.text,
    required this.version,
    required this.kind,
    this.stateCode,
  });

  factory LegalDisclaimerDto.fromJson(Map<String, Object?> json) =>
      _$LegalDisclaimerDtoFromJson(json);

  /// General information, not legal advice; no attorney-client relationship.
  final String text;

  /// Changes when the wording changes.
  final String version;

  /// The state whose own wording is used; null = default text.
  final String? stateCode;
  final LegalDisclaimerDtoKind kind;

  Map<String, Object?> toJson() => _$LegalDisclaimerDtoToJson(this);
}
