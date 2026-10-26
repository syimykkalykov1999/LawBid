// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'password_saved_dto.g.dart';

@JsonSerializable()
class PasswordSavedDto {
  const PasswordSavedDto({required this.saved});

  factory PasswordSavedDto.fromJson(Map<String, Object?> json) =>
      _$PasswordSavedDtoFromJson(json);

  final bool saved;

  Map<String, Object?> toJson() => _$PasswordSavedDtoToJson(this);
}
