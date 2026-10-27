// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'no_show_dto.dart';

part 'no_show_info_dto.g.dart';

@JsonSerializable()
class NoShowInfoDto {
  const NoShowInfoDto({required this.noShows, required this.canMarkNoShow});

  factory NoShowInfoDto.fromJson(Map<String, Object?> json) =>
      _$NoShowInfoDtoFromJson(json);

  final List<NoShowDto> noShows;

  /// The viewer may mark the other side as absent now (switch on, confirmed, after the grace window, before the marking window ends).
  final bool canMarkNoShow;

  Map<String, Object?> toJson() => _$NoShowInfoDtoToJson(this);
}
