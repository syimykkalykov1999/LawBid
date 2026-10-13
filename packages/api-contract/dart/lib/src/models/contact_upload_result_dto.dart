// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'contact_upload_result_dto.g.dart';

@JsonSerializable()
class ContactUploadResultDto {
  const ContactUploadResultDto({required this.matched});

  factory ContactUploadResultDto.fromJson(Map<String, Object?> json) =>
      _$ContactUploadResultDtoFromJson(json);

  /// Hashes of this upload that belong to LawBid users.
  final int matched;

  Map<String, Object?> toJson() => _$ContactUploadResultDtoToJson(this);
}
