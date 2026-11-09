// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'identity_check_link_dto.g.dart';

@JsonSerializable()
class IdentityCheckLinkDto {
  const IdentityCheckLinkDto({required this.inquiryId, required this.url});

  factory IdentityCheckLinkDto.fromJson(Map<String, Object?> json) =>
      _$IdentityCheckLinkDtoFromJson(json);

  /// Persona inquiry id (inq_…).
  final String inquiryId;

  /// Persona's hosted verification page; open it in the in-app browser.
  final String url;

  Map<String, Object?> toJson() => _$IdentityCheckLinkDtoToJson(this);
}
