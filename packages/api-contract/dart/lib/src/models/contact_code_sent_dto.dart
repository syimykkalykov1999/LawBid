// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'contact_code_sent_dto.g.dart';

@JsonSerializable()
class ContactCodeSentDto {
  const ContactCodeSentDto({required this.sent});

  factory ContactCodeSentDto.fromJson(Map<String, Object?> json) =>
      _$ContactCodeSentDtoFromJson(json);

  /// Always true: the code was sent.
  final bool sent;

  Map<String, Object?> toJson() => _$ContactCodeSentDtoToJson(this);
}
