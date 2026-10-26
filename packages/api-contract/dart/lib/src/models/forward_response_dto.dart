// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'forward_result_dto.dart';

part 'forward_response_dto.g.dart';

@JsonSerializable()
class ForwardResponseDto {
  const ForwardResponseDto({required this.results});

  factory ForwardResponseDto.fromJson(Map<String, Object?> json) =>
      _$ForwardResponseDtoFromJson(json);

  final List<ForwardResultDto> results;

  Map<String, Object?> toJson() => _$ForwardResponseDtoToJson(this);
}
