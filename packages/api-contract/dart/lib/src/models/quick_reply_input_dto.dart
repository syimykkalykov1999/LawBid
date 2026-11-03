// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'quick_reply_input_dto.g.dart';

@JsonSerializable()
class QuickReplyInputDto {
  const QuickReplyInputDto({required this.title, required this.body});

  factory QuickReplyInputDto.fromJson(Map<String, Object?> json) =>
      _$QuickReplyInputDtoFromJson(json);

  /// Short name in the picker.
  final String title;

  /// Text put into the composer.
  final String body;

  Map<String, Object?> toJson() => _$QuickReplyInputDtoToJson(this);
}
