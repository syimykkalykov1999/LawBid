// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'confirm_minor_dto.g.dart';

@JsonSerializable()
class ConfirmMinorDto {
  const ConfirmMinorDto({required this.reason});

  factory ConfirmMinorDto.fromJson(Map<String, Object?> json) =>
      _$ConfirmMinorDtoFromJson(json);

  /// How the age was confirmed (audited, mandatory).
  final String reason;

  Map<String, Object?> toJson() => _$ConfirmMinorDtoToJson(this);
}
