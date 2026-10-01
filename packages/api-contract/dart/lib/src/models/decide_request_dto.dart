// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'decide_request_dto.g.dart';

@JsonSerializable()
class DecideRequestDto {
  const DecideRequestDto({this.note});

  factory DecideRequestDto.fromJson(Map<String, Object?> json) =>
      _$DecideRequestDtoFromJson(json);

  final String? note;

  Map<String, Object?> toJson() => _$DecideRequestDtoToJson(this);
}
