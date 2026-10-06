// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_partner_external_dto.g.dart';

@JsonSerializable()
class AdminPartnerExternalDto {
  const AdminPartnerExternalDto({required this.name, required this.contact});

  factory AdminPartnerExternalDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerExternalDtoFromJson(json);

  /// How the admin knows the blogger.
  final String name;
  final String? contact;

  Map<String, Object?> toJson() => _$AdminPartnerExternalDtoToJson(this);
}
