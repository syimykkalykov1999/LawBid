// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_message_dto_author.dart';

part 'support_message_dto.g.dart';

@JsonSerializable()
class SupportMessageDto {
  const SupportMessageDto({
    required this.id,
    required this.author,
    required this.body,
    required this.createdAt,
    this.authorName,
  });

  factory SupportMessageDto.fromJson(Map<String, Object?> json) =>
      _$SupportMessageDtoFromJson(json);

  final String id;
  final SupportMessageDtoAuthor author;

  /// "LawBid Support" or "LawBid Support · <first name>" for support; null for own messages.
  final String? authorName;
  final String body;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$SupportMessageDtoToJson(this);
}
