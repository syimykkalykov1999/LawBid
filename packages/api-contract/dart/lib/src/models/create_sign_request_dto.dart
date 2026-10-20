// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_sign_request_dto.g.dart';

@JsonSerializable()
class CreateSignRequestDto {
  const CreateSignRequestDto({required this.fileId, required this.title});

  factory CreateSignRequestDto.fromJson(Map<String, Object?> json) =>
      _$CreateSignRequestDtoFromJson(json);

  /// A clean PDF of the sender (case_attachment).
  final String fileId;
  final String title;

  Map<String, Object?> toJson() => _$CreateSignRequestDtoToJson(this);
}
