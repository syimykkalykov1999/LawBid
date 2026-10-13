// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'upload_contact_hashes_dto.g.dart';

@JsonSerializable()
class UploadContactHashesDto {
  const UploadContactHashesDto({required this.hashes});

  factory UploadContactHashesDto.fromJson(Map<String, Object?> json) =>
      _$UploadContactHashesDtoFromJson(json);

  /// Lowercase hex SHA-256 of each normalized E.164 number ("+14155552680"). Never raw numbers.
  final List<String> hashes;

  Map<String, Object?> toJson() => _$UploadContactHashesDtoToJson(this);
}
