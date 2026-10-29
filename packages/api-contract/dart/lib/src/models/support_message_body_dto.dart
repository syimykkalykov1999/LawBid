// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_attachment_input_dto.dart';

part 'support_message_body_dto.g.dart';

@JsonSerializable()
class SupportMessageBodyDto {
  const SupportMessageBodyDto({
    required this.body,
    this.attachments,
  });
  
  factory SupportMessageBodyDto.fromJson(Map<String, Object?> json) => _$SupportMessageBodyDtoFromJson(json);
  
  /// May be empty when files are attached.
  final String body;
  final List<SupportAttachmentInputDto>? attachments;

  Map<String, Object?> toJson() => _$SupportMessageBodyDtoToJson(this);
}
