// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'contact_verified_dto.g.dart';

@JsonSerializable()
class ContactVerifiedDto {
  const ContactVerifiedDto({required this.verified});

  factory ContactVerifiedDto.fromJson(Map<String, Object?> json) =>
      _$ContactVerifiedDtoFromJson(json);

  /// Always true.
  final bool verified;

  Map<String, Object?> toJson() => _$ContactVerifiedDtoToJson(this);
}
