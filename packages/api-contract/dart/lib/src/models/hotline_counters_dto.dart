// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_counter_dto.dart';

part 'hotline_counters_dto.g.dart';

@JsonSerializable()
class HotlineCountersDto {
  const HotlineCountersDto({required this.items});

  factory HotlineCountersDto.fromJson(Map<String, Object?> json) =>
      _$HotlineCountersDtoFromJson(json);

  final List<HotlineCounterDto> items;

  Map<String, Object?> toJson() => _$HotlineCountersDtoToJson(this);
}
