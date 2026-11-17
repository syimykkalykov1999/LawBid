// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_counter_dto.g.dart';

@JsonSerializable()
class HotlineCounterDto {
  const HotlineCounterDto({
    required this.key,
    required this.lawyers,
    required this.clients,
  });

  factory HotlineCounterDto.fromJson(Map<String, Object?> json) =>
      _$HotlineCounterDtoFromJson(json);

  /// b:<state~practice~lang> or l:<lang>
  final String key;

  /// Banded: 0, 1 (есть), 10+, 50+, 100+
  final String lawyers;
  final String clients;

  Map<String, Object?> toJson() => _$HotlineCounterDtoToJson(this);
}
