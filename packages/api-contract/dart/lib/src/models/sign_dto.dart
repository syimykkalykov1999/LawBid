// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sign_dto_method.dart';

part 'sign_dto.g.dart';

@JsonSerializable()
class SignDto {
  const SignDto({
    required this.method,
    required this.name,
    required this.consent,
    this.imagePngBase64,
  });
  
  factory SignDto.fromJson(Map<String, Object?> json) => _$SignDtoFromJson(json);
  
  final SignDtoMethod method;

  /// The name the signer types.
  final String name;

  /// Base64 PNG of the drawn signature (method = drawn).
  final String? imagePngBase64;

  /// The signer agreed to sign and keep records electronically.
  final bool consent;

  Map<String, Object?> toJson() => _$SignDtoToJson(this);
}
