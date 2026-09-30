import 'dart:math';

import 'package:flutter/foundation.dart';

enum ConversationStatus { preAcceptance, active, closed }

/// OQ-043: a direct chat from a profile starts as a message request.
enum MessageRequest { none, pending, accepted, declined }

/// The other side of a chat (docs/05 §8.1): an attorney always by public
/// profile; a client hidden ("Клиент по кейсу «…»") until contacts unlock.
@immutable
class Counterpart {
  const Counterpart({
    required this.isAttorney,
    required this.verified,
    this.id,
    this.displayName,
    this.username,
    this.avatarUrl,
  });

  final bool isAttorney;
  final String? id;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final bool verified;

  /// A client before contacts are unlocked.
  bool get hidden => !isAttorney && displayName == null;
}

@immutable
class Conversation {
  const Conversation({
    required this.id,
    required this.caseId,
    required this.caseTitle,
    required this.status,
    required this.contactsUnlocked,
    required this.counterpart,
    required this.unreadCount,
    required this.updatedAt,
    this.lastMessage,
    this.lastMessageAt,
    this.mutedUntil,
    this.counterpartLastReadId,
    this.isDirect = false,
    this.request = MessageRequest.none,
    this.requestedByMe = false,
  });

  /// OQ-043: started from a profile ("Message"), not from a case.
  final bool isDirect;
  final MessageRequest request;

  /// The viewer sent the request.
  final bool requestedByMe;

  /// A request waiting for the viewer's answer.
  bool get awaitingMyAnswer =>
      request == MessageRequest.pending && !requestedByMe;

  /// The viewer's own request not answered yet.
  bool get myRequestPending =>
      request == MessageRequest.pending && requestedByMe;

  bool get myRequestDeclined =>
      request == MessageRequest.declined && requestedByMe;

  final String id;

  /// Reserved: null when a conversation has no case (none today).
  final String? caseId;
  final String? caseTitle;
  final ConversationStatus status;
  final bool contactsUnlocked;
  final Counterpart counterpart;
  final ChatMessage? lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;
  final DateTime? mutedUntil;
  final String? counterpartLastReadId;
  final DateTime updatedAt;

  bool get muted => mutedUntil != null && mutedUntil!.isAfter(DateTime.now());
  bool get closed => status == ConversationStatus.closed;
}

enum MessageKind { text, system, voice, call }

/// OQ-041: a call in the chat log (the sender placed it).
@immutable
class CallLog {
  const CallLog({required this.outcome, required this.durationSec});

  /// ended · missed · declined · busy · canceled · failed
  final String outcome;
  final int durationSec;
}

/// OQ-040: the audio of a voice message, like Telegram's.
@immutable
class VoiceNote {
  const VoiceNote({
    required this.durationMs,
    required this.waveform,
    required this.listened,
    this.url,
    this.localPath,
  });

  /// Short signed link (null in previews and while uploading).
  final String? url;

  /// The recorded file while it is being sent.
  final String? localPath;
  final int durationMs;

  /// 0–100 bars.
  final List<int> waveform;

  /// The recipient has played it (the dot goes away).
  final bool listened;

  VoiceNote copyWith({String? url, bool? listened}) => VoiceNote(
        url: url ?? this.url,
        localPath: localPath,
        durationMs: durationMs,
        waveform: waveform,
        listened: listened ?? this.listened,
      );
}

/// Where an own message is in its life (§8.2 "отправляется / отправлено /
/// прочитано"); server messages are [sent].
enum DeliveryState { sending, failed, sent }

@immutable
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.kind,
    required this.body,
    required this.createdAt,
    this.senderId,
    this.contactMasked = false,
    this.clientMessageId,
    this.delivery = DeliveryState.sent,
    this.failedCode,
    this.voice,
    this.callLog,
  });

  /// Server id, or `local:<clientMessageId>` while in the outbox.
  final String id;
  final String conversationId;
  final String? senderId;
  final MessageKind kind;

  /// body_display; for system messages a key (offer_accepted …).
  final String body;
  final bool contactMasked;
  final String? clientMessageId;
  final DateTime createdAt;
  final DeliveryState delivery;
  final String? failedCode;

  /// Set for [MessageKind.voice].
  final VoiceNote? voice;

  /// Set for [MessageKind.call].
  final CallLog? callLog;

  bool get isLocal => id.startsWith('local:');

  ChatMessage copyWith({
    VoiceNote? voice,
    DeliveryState? delivery,
    String? failedCode,
  }) =>
      ChatMessage(
        id: id,
        conversationId: conversationId,
        senderId: senderId,
        kind: kind,
        body: body,
        createdAt: createdAt,
        contactMasked: contactMasked,
        clientMessageId: clientMessageId,
        delivery: delivery ?? this.delivery,
        failedCode: failedCode ?? this.failedCode,
        voice: voice ?? this.voice,
        callLog: callLog,
      );
}

/// UUID v4 for clientMessageId (idempotency key of a message, §8.4).
String newClientMessageId() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  String hex(int from, int to) => b
      .sublist(from, to)
      .map((x) => x.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}
