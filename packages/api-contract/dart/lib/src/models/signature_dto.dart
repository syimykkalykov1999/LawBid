// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'signature_dto_method.dart';
import 'signature_dto_role.dart';

part 'signature_dto.g.dart';

@JsonSerializable()
class SignatureDto {
  const SignatureDto({
    required this.role,
    required this.name,
    required this.method,
    required this.signedAt,
  });
  
  factory SignatureDto.fromJson(Map<String, Object?> json) => _$SignatureDtoFromJson(json);
  
  final SignatureDtoRole role;
  final String name;
  final SignatureDtoMethod method;
  final DateTime signedAt;

  Map<String, Object?> toJson() => _$SignatureDtoToJson(this);
}
