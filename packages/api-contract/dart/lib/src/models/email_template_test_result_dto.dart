// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'email_template_test_result_dto.g.dart';

@JsonSerializable()
class EmailTemplateTestResultDto {
  const EmailTemplateTestResultDto({required this.sentTo});

  factory EmailTemplateTestResultDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateTestResultDtoFromJson(json);

  /// Masked address the test went to.
  final String sentTo;

  Map<String, Object?> toJson() => _$EmailTemplateTestResultDtoToJson(this);
}
