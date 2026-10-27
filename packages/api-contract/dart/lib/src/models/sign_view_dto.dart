// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sign_view_dto_role.dart';

part 'sign_view_dto.g.dart';

@JsonSerializable()
class SignViewDto {
  const SignViewDto({required this.role, required this.at});

  factory SignViewDto.fromJson(Map<String, Object?> json) =>
      _$SignViewDtoFromJson(json);

  final SignViewDtoRole role;
  final DateTime at;

  Map<String, Object?> toJson() => _$SignViewDtoToJson(this);
}
