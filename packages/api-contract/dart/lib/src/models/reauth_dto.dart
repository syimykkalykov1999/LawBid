// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reauth_dto_method.dart';

part 'reauth_dto.g.dart';

@JsonSerializable()
class ReauthDto {
  const ReauthDto({
    required this.method,
    required this.identifier,
    required this.code,
  });

  factory ReauthDto.fromJson(Map<String, Object?> json) =>
      _$ReauthDtoFromJson(json);

  final ReauthDtoMethod method;
  final String identifier;
  final String code;

  Map<String, Object?> toJson() => _$ReauthDtoToJson(this);
}
