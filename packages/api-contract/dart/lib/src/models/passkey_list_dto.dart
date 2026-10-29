// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'passkey_dto.dart';

part 'passkey_list_dto.g.dart';

@JsonSerializable()
class PasskeyListDto {
  const PasskeyListDto({
    required this.passkeys,
  });
  
  factory PasskeyListDto.fromJson(Map<String, Object?> json) => _$PasskeyListDtoFromJson(json);
  
  final List<PasskeyDto> passkeys;

  Map<String, Object?> toJson() => _$PasskeyListDtoToJson(this);
}
