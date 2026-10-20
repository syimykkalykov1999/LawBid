// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'decline_sign_dto.g.dart';

@JsonSerializable()
class DeclineSignDto {
  const DeclineSignDto({this.reason});

  factory DeclineSignDto.fromJson(Map<String, Object?> json) =>
      _$DeclineSignDtoFromJson(json);

  final String? reason;

  Map<String, Object?> toJson() => _$DeclineSignDtoToJson(this);
}
