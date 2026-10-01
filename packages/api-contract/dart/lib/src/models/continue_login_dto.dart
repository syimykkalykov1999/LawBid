// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'continue_login_dto.g.dart';

@JsonSerializable()
class ContinueLoginDto {
  const ContinueLoginDto({required this.pendingToken});

  factory ContinueLoginDto.fromJson(Map<String, Object?> json) =>
      _$ContinueLoginDtoFromJson(json);

  /// details.pendingToken of the 409 answer.
  final String pendingToken;

  Map<String, Object?> toJson() => _$ContinueLoginDtoToJson(this);
}
