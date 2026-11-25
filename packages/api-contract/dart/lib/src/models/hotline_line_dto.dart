// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_line_dto.g.dart';

@JsonSerializable()
class HotlineLineDto {
  const HotlineLineDto({
    required this.states,
    required this.practiceAreas,
    required this.languages,
    this.accepting = true,
  });

  factory HotlineLineDto.fromJson(Map<String, Object?> json) =>
      _$HotlineLineDtoFromJson(json);

  /// Two-letter states; only states of verified licences.
  final List<String> states;

  /// Practice area codes.
  final List<String> practiceAreas;

  /// Language codes (en, es, ru…) from the full language list, up to hotline.attorney_max_languages (owner 25.11).
  final List<String> languages;

  /// «Принимать звонки»; false = on the line, no new calls.
  final bool accepting;

  Map<String, Object?> toJson() => _$HotlineLineDtoToJson(this);
}
