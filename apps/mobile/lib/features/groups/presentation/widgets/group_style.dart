import 'package:flutter/material.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The server numbers a topic's colour 0-6 (`TOPIC_COLORS`); these are the
/// seven hues, in the same order, at a lightness that carries a white
/// emoji or letter in every theme.
Color groupTopicColor(num index) {
  const hues = [210.0, 145.0, 38.0, 4.0, 275.0, 328.0, 182.0];
  final h = hues[index.toInt().abs() % hues.length];
  return HSLColor.fromAHSL(1, h, 0.55, 0.42).toColor();
}

/// How many colours a topic can have.
const int kGroupTopicColorCount = 7;

/// A sender's name colour: a stable hue from the user id (the same person
/// has the same colour on every device), lighter on dark themes.
Color groupSenderColor(String userId, Brightness brightness) {
  // FNV-1a: `String.hashCode` differs between runs.
  var h = 0x811c9dc5;
  for (final c in userId.codeUnits) {
    h = ((h ^ c) * 0x01000193) & 0xffffffff;
  }
  final dark = brightness == Brightness.dark;
  return HSLColor.fromAHSL(
    1,
    (h % 360).toDouble(),
    dark ? 0.62 : 0.6,
    dark ? 0.7 : 0.36,
  ).toColor();
}

/// A person's name for a chat: display name, else «@username», else
/// «Someone».
String groupPersonName(Translator t, api.GroupPersonDto? p) {
  final name = p?.displayName?.trim();
  if (name != null && name.isNotEmpty) return name;
  final handle = p?.username?.trim();
  if (handle != null && handle.isNotEmpty) return '@$handle';
  return t.t('group.someone');
}

/// A member's name, same rules as [groupPersonName].
String groupMemberName(Translator t, api.GroupMemberDto m) {
  final name = m.displayName?.trim();
  if (name != null && name.isNotEmpty) return name;
  final handle = m.username?.trim();
  if (handle != null && handle.isNotEmpty) return '@$handle';
  return t.t('group.someone');
}

/// The chat's attachment widgets take the 1:1 chat's model.
ChatAttachment groupChatAttachment(api.ChatAttachmentDto a) => ChatAttachment(
      fileId: a.fileId,
      name: a.name,
      isImage: a.isImage,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      url: a.url,
      previewUrl: a.previewUrl,
      width: a.width,
      height: a.height,
    );
