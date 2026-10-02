// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rendered_email_dto.g.dart';

@JsonSerializable()
class RenderedEmailDto {
  const RenderedEmailDto({
    required this.subject,
    required this.text,
    this.html,
  });

  factory RenderedEmailDto.fromJson(Map<String, Object?> json) =>
      _$RenderedEmailDtoFromJson(json);

  final String subject;
  final String text;
  final String? html;

  Map<String, Object?> toJson() => _$RenderedEmailDtoToJson(this);
}
