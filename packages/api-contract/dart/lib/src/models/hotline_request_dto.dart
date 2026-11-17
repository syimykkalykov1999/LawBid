// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_request_dto.g.dart';

@JsonSerializable()
class HotlineRequestDto {
  const HotlineRequestDto({
    required this.state,
    required this.practiceArea,
    required this.languages,
    required this.topic,
  });

  factory HotlineRequestDto.fromJson(Map<String, Object?> json) =>
      _$HotlineRequestDtoFromJson(json);

  final String state;
  final String practiceArea;

  /// Up to hotline.max_languages.
  final List<String> languages;

  /// «О чём звонок», up to hotline.topic_max_chars.
  final String topic;

  Map<String, Object?> toJson() => _$HotlineRequestDtoToJson(this);
}
