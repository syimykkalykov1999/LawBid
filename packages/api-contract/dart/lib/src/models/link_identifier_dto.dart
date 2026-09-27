// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'link_identifier_dto_provider.dart';

part 'link_identifier_dto.g.dart';

@JsonSerializable()
class LinkIdentifierDto {
  const LinkIdentifierDto({
    required this.provider,
    this.identifier,
    this.code,
    this.idToken,
    this.nonce,
  });

  factory LinkIdentifierDto.fromJson(Map<String, Object?> json) =>
      _$LinkIdentifierDtoFromJson(json);

  final LinkIdentifierDtoProvider provider;
  final String? identifier;
  final String? code;
  final String? idToken;
  final String? nonce;

  Map<String, Object?> toJson() => _$LinkIdentifierDtoToJson(this);
}
