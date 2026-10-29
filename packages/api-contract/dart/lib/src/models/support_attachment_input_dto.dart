// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'support_attachment_input_dto.g.dart';

@JsonSerializable()
class SupportAttachmentInputDto {
  const SupportAttachmentInputDto({
    required this.fileId,
    required this.name,
  });
  
  factory SupportAttachmentInputDto.fromJson(Map<String, Object?> json) => _$SupportAttachmentInputDtoFromJson(json);
  
  /// A clean file of purpose support_attachment owned by the sender (presign → upload → confirm).
  final String fileId;

  /// File name.
  final String name;

  Map<String, Object?> toJson() => _$SupportAttachmentInputDtoToJson(this);
}
