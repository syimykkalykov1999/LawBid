// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'submit_client_badge_dto.g.dart';

@JsonSerializable()
class SubmitClientBadgeDto {
  const SubmitClientBadgeDto({required this.fileIds, this.note});

  factory SubmitClientBadgeDto.fromJson(Map<String, Object?> json) =>
      _$SubmitClientBadgeDtoFromJson(json);

  /// Uploaded verification_document / verification_selfie files.
  final List<String> fileIds;
  final String? note;

  Map<String, Object?> toJson() => _$SubmitClientBadgeDtoToJson(this);
}
