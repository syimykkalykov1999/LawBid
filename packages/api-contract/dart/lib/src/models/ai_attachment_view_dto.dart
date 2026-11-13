// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_attachment_view_dto.g.dart';

@JsonSerializable()
class AiAttachmentViewDto {
  const AiAttachmentViewDto({
    required this.id,
    required this.mime,
    required this.previewUrl,
    required this.ready,
  });

  factory AiAttachmentViewDto.fromJson(Map<String, Object?> json) =>
      _$AiAttachmentViewDtoFromJson(json);

  final String id;
  final String mime;

  /// Short signed preview link (owner page only).
  final String? previewUrl;

  /// False while the antivirus check runs.
  final bool ready;

  Map<String, Object?> toJson() => _$AiAttachmentViewDtoToJson(this);
}
