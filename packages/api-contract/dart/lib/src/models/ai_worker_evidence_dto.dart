// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_worker_evidence_dto.g.dart';

@JsonSerializable()
class AiWorkerEvidenceDto {
  const AiWorkerEvidenceDto({required this.source, required this.note});

  factory AiWorkerEvidenceDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerEvidenceDtoFromJson(json);

  /// A platform fact line or a data field name.
  final String source;
  final String note;

  Map<String, Object?> toJson() => _$AiWorkerEvidenceDtoToJson(this);
}
