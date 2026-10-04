// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'translate_message_dto.g.dart';

@JsonSerializable()
class TranslateMessageDto {
  const TranslateMessageDto({required this.target});

  factory TranslateMessageDto.fromJson(Map<String, Object?> json) =>
      _$TranslateMessageDtoFromJson(json);

  /// Target language, ISO 639-1 (or zh-CN / zh-TW), e.g. "ru".
  final String target;

  Map<String, Object?> toJson() => _$TranslateMessageDtoToJson(this);
}
