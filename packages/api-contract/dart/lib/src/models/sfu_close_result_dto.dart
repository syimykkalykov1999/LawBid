// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_close_result_dto_type.dart';

part 'sfu_close_result_dto.g.dart';

@JsonSerializable()
class SfuCloseResultDto {
  const SfuCloseResultDto({
    required this.closed,
    required this.type,
    required this.sdp,
  });
  
  factory SfuCloseResultDto.fromJson(Map<String, Object?> json) => _$SfuCloseResultDtoFromJson(json);
  
  /// The mids that were closed.
  final List<String> closed;
  final SfuCloseResultDtoType? type;
  final String? sdp;

  Map<String, Object?> toJson() => _$SfuCloseResultDtoToJson(this);
}
