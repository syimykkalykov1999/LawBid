// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_agent_dto.dart';
import 'legal_texts_dto.dart';

part 'legal_public_dto.g.dart';

@JsonSerializable()
class LegalPublicDto {
  const LegalPublicDto({
    required this.dmcaAgent,
    required this.texts,
    required this.partnerTermsVersion,
  });

  factory LegalPublicDto.fromJson(Map<String, Object?> json) =>
      _$LegalPublicDtoFromJson(json);

  final DmcaAgentDto dmcaAgent;
  final LegalTextsDto texts;

  /// Current partner rules version (partners re-accept on change).
  final String partnerTermsVersion;

  Map<String, Object?> toJson() => _$LegalPublicDtoToJson(this);
}
