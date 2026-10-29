// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'passkey_removed_dto.g.dart';

@JsonSerializable()
class PasskeyRemovedDto {
  const PasskeyRemovedDto({
    required this.removed,
  });
  
  factory PasskeyRemovedDto.fromJson(Map<String, Object?> json) => _$PasskeyRemovedDtoFromJson(json);
  
  final bool removed;

  Map<String, Object?> toJson() => _$PasskeyRemovedDtoToJson(this);
}
