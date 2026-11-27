import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/audio/web_audio_support_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/audio/web_audio_support_web.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';

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
    this.avatarFullUrl,
    this.online,
    this.lastSeenAt,
  });

  final bool isAttorney;
  final String? id;
  final String? displayName;
  final String? username;
  final String? avatarUrl;

  /// Owner 2026-10-18: the full-size photo (full-screen view).
  final String? avatarFullUrl;
  final bool verified;

  /// Owner 2026-10-01: online now; null = not shown (hidden activity
  /// status on either side, an anonymous client, a pending request).
  final bool? online;
  final DateTime? lastSeenAt;

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
    this.callsMuted = false,
    this.counterpartLastReadId,
    this.counterpartLastDeliveredId,
    this.counterpartLastReadAt,
    this.isDirect = false,
    this.request = MessageRequest.none,
    this.requestedByMe = false,
    this.folder = ChatFolder.general,
    this.folderAuto = true,
    this.waitingSince,
    this.note,
    this.pinnedAt,
    this.markedUnread = false,
    this.blocked = false,
    this.matchedMessage,
    this.disappearAfterS,
    this.e2eeSince,
  });

  /// The same chat with the other side's receipts moved (a socket event):
  /// only the given ones change.
  Conversation withReceipts({
    String? readId,
    DateTime? readAt,
    String? deliveredId,
  }) =>
      Conversation(
        id: id,
        caseId: caseId,
        caseTitle: caseTitle,
        status: status,
        contactsUnlocked: contactsUnlocked,
        blocked: blocked,
        counterpart: counterpart,
        lastMessage: lastMessage,
        lastMessageAt: lastMessageAt,
        unreadCount: unreadCount,
        mutedUntil: mutedUntil,
        callsMuted: callsMuted,
        counterpartLastReadId: readId ?? counterpartLastReadId,
        counterpartLastReadAt: readAt ?? counterpartLastReadAt,
        counterpartLastDeliveredId: deliveredId ?? counterpartLastDeliveredId,
        updatedAt: updatedAt,
        isDirect: isDirect,
        request: request,
        requestedByMe: requestedByMe,
        folder: folder,
        folderAuto: folderAuto,
        waitingSince: waitingSince,
        note: note,
        pinnedAt: pinnedAt,
        markedUnread: markedUnread,
        matchedMessage: matchedMessage,
        disappearAfterS: disappearAfterS,
        e2eeSince: e2eeSince,
      );

  /// Owner 2026-10-22 (load audit finding 2): the same chat after a socket
  /// event moved its last message / unread count (the list updates its row
  /// instead of reloading); only the given ones change.
  Conversation withActivity({
    ChatMessage? lastMessage,
    DateTime? lastMessageAt,
    int? unreadCount,
    DateTime? updatedAt,
    bool? markedUnread,
  }) =>
      Conversation(
        id: id,
        caseId: caseId,
        caseTitle: caseTitle,
        status: status,
        contactsUnlocked: contactsUnlocked,
        blocked: blocked,
        counterpart: counterpart,
        lastMessage: lastMessage ?? this.lastMessage,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt,
        unreadCount: unreadCount ?? this.unreadCount,
        mutedUntil: mutedUntil,
        callsMuted: callsMuted,
        counterpartLastReadId: counterpartLastReadId,
        counterpartLastReadAt: counterpartLastReadAt,
        counterpartLastDeliveredId: counterpartLastDeliveredId,
        updatedAt: updatedAt ?? this.updatedAt,
        isDirect: isDirect,
        request: request,
        requestedByMe: requestedByMe,
        folder: folder,
        folderAuto: folderAuto,
        waitingSince: waitingSince,
        note: note,
        pinnedAt: pinnedAt,
        markedUnread: markedUnread ?? this.markedUnread,
        matchedMessage: matchedMessage,
        disappearAfterS: disappearAfterS,
        e2eeSince: e2eeSince,
      );

  /// Owner 2026-10-18: in a search by text, the message that matched —
  /// shown instead of the last-message preview.
  final String? matchedMessage;

  /// Owner 2026-10-21 (WhatsApp): seconds a new message lives here
  /// (86400 / 604800 / 7776000); null = disappearing messages are off.
  final int? disappearAfterS;

  /// Item 25 (WhatsApp «Сообщения защищены сквозным шифрованием»): since
  /// when this chat is end-to-end encrypted (MLS); null = it is not.
  final DateTime? e2eeSince;

  /// Audit 2026-10-04: either side blocked the other. An accepted case
  /// chat that is not closed keeps working (see [blockedHere]).
  final bool blocked;

  /// The block applies in this chat: no composer, no call button.
  bool get blockedHere =>
      blocked && !(caseId != null && contactsUnlocked && !closed);

  /// Owner 2026-10-01: my folder (case chats Primary by default).
  final ChatFolder folder;

  /// true = chosen automatically (not moved by me).
  final bool folderAuto;

  /// "Waiting for my answer" since — the Waiting folder.
  final DateTime? waitingSince;

  /// My note pinned on the chat ("send him the documents").
  final String? note;
  final DateTime? pinnedAt;

  bool get waiting => waitingSince != null;
  bool get pinned => pinnedAt != null;

  /// Row 110 (Telegram «Mark as unread», WhatsApp «Mark as unread»): I put
  /// the unread mark back on myself; reading the chat takes it off.
  final bool markedUnread;

  /// The row counts as unread: new messages, or my own unread mark.
  bool get hasUnread => unreadCount > 0 || markedUnread;

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

  /// Owner 2026-10-21: calls of this chat ring silently for me.
  final bool callsMuted;
  final String? counterpartLastReadId;

  /// The newest of my messages that reached the other device (two grey
  /// ticks); reading implies it.
  final String? counterpartLastDeliveredId;

  /// When the other side last read: "seen at HH:MM" for every message up
  /// to [counterpartLastReadId].
  final DateTime? counterpartLastReadAt;
  final DateTime updatedAt;

  bool get muted => mutedUntil != null && mutedUntil!.isAfter(DateTime.now());
  bool get closed => status == ConversationStatus.closed;
}

/// Owner 2026-10-01: Instagram-like folders of the chat list.
enum ChatFolder { primary, general }

/// «Forever» (Telegram's «Disable», WhatsApp's «Always»): the server keeps
/// a moment, so forever is a moment ten years away. One name for it in the
/// whole app.
const kMuteForever = Duration(days: 3650);

/// The chat list's sub-tabs: All · Unread · Groups · Cases · Waiting ·
/// Requests (owner 2026-10-21: «Cases» = only the chats tied to a case).
/// `archive` (owner 2026-10-20) is the Archive screen, never a pill.
/// Row 110 (WhatsApp «Unread» filter, 2024; Telegram «Unread» folder):
/// [unread] is filtered on the device from the «All» list in memory, it is
/// never sent to the server.
/// `groups` (owner 2026-11-16, WhatsApp «Группы» filter): only my group
/// chats, read from the groups list on the phone, never sent to the server
/// as a folder of direct chats; a pill only while «Группы в чатах» is on.
enum ChatListFolder {
  all,
  unread,
  groups,
  primary,
  general,
  cases,
  waiting,
  requests,
  archive,
}

// OQ-047: `attachment` — a photo or a document after acceptance.
// Owner 2026-10-20: `contact` — a shared attorney card, `place` — an address.
enum MessageKind {
  text,
  system,
  voice,
  call,
  attachment,
  sticker,
  contact,
  place,
  // Owner 2026-10-21 (Instagram «Поделиться»): a post sent as a card.
  post,
}

/// Owner 2026-10-21 (Instagram «Поделиться»): a post shared in a chat —
/// the card opens /post/:id. [available] false = deleted or hidden since.
@immutable
class SharedPostCard {
  const SharedPostCard({
    required this.id,
    required this.available,
    this.authorId,
    this.authorName,
    this.authorUsername,
    this.authorAvatarUrl,
    this.authorVerified = false,
    this.title,
    this.excerpt,
    this.thumbnailUrl,
    this.isVideo = false,
  });

  final String id;
  final bool available;
  final String? authorId;
  final String? authorName;
  final String? authorUsername;
  final String? authorAvatarUrl;
  final bool authorVerified;
  final String? title;
  final String? excerpt;
  final String? thumbnailUrl;
  final bool isVideo;
}

/// Owner 2026-10-20: an attorney shared in a chat — the public profile only
/// (never a phone or an e-mail).
@immutable
class ContactCard {
  const ContactCard({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.verified,
    this.avatarUrl,
    this.firmNames = const [],
    this.practiceKeys = const [],
    this.licensedStates = const [],
  });

  final String userId;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final bool verified;
  final List<String> firmNames;

  /// Translation keys of the practice areas.
  final List<String> practiceKeys;
  final List<String> licensedStates;
}

/// OQ-041: a call in the chat log (the sender placed it).
@immutable
class CallLog {
  const CallLog({required this.outcome, required this.durationSec});

  /// ended · missed · declined · busy · canceled · failed
  final String outcome;
  final int durationSec;
}

/// Owner row 146: a note recorded on the website in Firefox / Linux Chrome
/// is Opus in WebM, which the iPhone's player (AVPlayer) cannot play; the
/// server stores an AAC/M4A copy and sends it as `voice.m4aUrl`. The iPhone
/// app plays that copy (the original when there is none); Android keeps the
/// original link. The website keeps it too, unless the browser says it
/// cannot play Opus in WebM (`canPlayType`, e.g. Safari on an older iPhone):
/// then it gets the copy (R2 review).
String? playableVoiceUrl(
  String? url,
  String? m4aUrl, {
  TargetPlatform? platform,
  bool web = kIsWeb,
  bool Function()? webPlaysWebm,
}) {
  if (m4aUrl == null) return url;
  if (web) return (webPlaysWebm ?? canPlayWebmOpus)() ? url : m4aUrl;
  return (platform ?? defaultTargetPlatform) == TargetPlatform.iOS
      ? m4aUrl
      : url;
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

/// OQ-047: a photo or a document sent in a chat after acceptance.
@immutable
class ChatAttachment {
  const ChatAttachment({
    required this.fileId,
    required this.name,
    required this.isImage,
    this.mime,
    this.sizeBytes,
    this.url,
    this.previewUrl,
    this.width,
    this.height,
    this.localBytes,
    this.progress = 0,
    this.blurhash,
    this.removed = false,
  });

  final String fileId;
  final String name;
  final bool isImage;
  final String? mime;
  final int? sizeBytes;

  /// Short signed links (null in previews and while uploading).
  final String? url;
  final String? previewUrl;
  final int? width;
  final int? height;

  /// The picked file while it is being sent (kept for Retry).
  final Uint8List? localBytes;

  /// Upload progress 0–1 while sending.
  final double progress;

  /// Owner row 106 (Telegram): the photo's tiny blurred stand-in from the
  /// server, drawn while the picture loads instead of a grey box.
  final String? blurhash;

  /// M3 (owner 25.11): the antivirus refused the file (or it is gone) — the
  /// bubble shows «removed» for everyone instead of the file.
  final bool removed;

  /// Lowercase extension of [name] ("pdf", "xlsx"…), '' when none.
  /// Owner 2026-10-17: a video (MP4 / MOV).
  bool get isVideo =>
      (mime?.startsWith('video/') ?? false) ||
      extension == 'mp4' ||
      extension == 'mov';

  String get extension {
    final dot = name.lastIndexOf('.');
    return dot < 0 || dot == name.length - 1
        ? ''
        : name.substring(dot + 1).toLowerCase();
  }

  ChatAttachment copyWith({double? progress}) => ChatAttachment(
        fileId: fileId,
        name: name,
        isImage: isImage,
        mime: mime,
        sizeBytes: sizeBytes,
        url: url,
        previewUrl: previewUrl,
        width: width,
        height: height,
        localBytes: localBytes,
        progress: progress ?? this.progress,
        blurhash: blurhash,
        removed: removed,
      );
}

/// Where an own message is in its life (§8.2 "отправляется / отправлено /
/// прочитано"); server messages are [sent].
enum DeliveryState { sending, failed, sent }

/// Owner 2026-10-20: the quoted message of a reply.
@immutable
/// Third pass S3 (26.11; WhatsApp Security Whitepaper «Link previews»):
/// the card of a link in an end-to-end encrypted chat. The SENDER's phone
/// reads the site and sends this inside the encryption; the receivers draw
/// it as it came and never ask the server about the address. [thumbnail]
/// is a small JPEG made on the sender's phone (no picture is fetched by a
/// receiver either).
@immutable
class SealedLinkCard {
  const SealedLinkCard({
    required this.url,
    this.title,
    this.description,
    this.siteName,
    this.thumbnail,
  });

  /// The payload's `lp` field (null when it is missing or malformed).
  static SealedLinkCard? tryParse(Object? raw) {
    if (raw is! Map) return null;
    String? s(String k, int max) {
      final v = raw[k];
      if (v is! String) return null;
      final t = v.trim();
      if (t.isEmpty) return null;
      return t.length > max ? t.substring(0, max) : t;
    }

    final url = s('u', 2048);
    final uri = url == null ? null : Uri.tryParse(url);
    if (uri == null || !(uri.isScheme('https') || uri.isScheme('http'))) {
      return null;
    }
    Uint8List? thumb;
    final th = raw['th'];
    if (th is String && th.length <= maxThumbnailB64) {
      try {
        thumb = base64Decode(th);
      } on FormatException {
        thumb = null;
      }
    }
    final card = SealedLinkCard(
      url: url!,
      title: s('ti', 200),
      description: s('d', 300),
      siteName: s('s', 100),
      thumbnail: thumb,
    );
    return card.hasContent ? card : null;
  }

  /// The picture's limit inside the encrypted message (base64 chars): the
  /// whole MLS message must stay under the server's 128 KiB.
  static const maxThumbnailB64 = 48 * 1024;

  final String url;
  final String? title;
  final String? description;
  final String? siteName;
  final Uint8List? thumbnail;

  bool get hasContent =>
      (title ?? '').isNotEmpty ||
      (description ?? '').isNotEmpty ||
      thumbnail != null;

  Map<String, Object?> toJson() => {
        'u': url,
        if (title != null) 'ti': title,
        if (description != null) 'd': description,
        if (siteName != null) 's': siteName,
        if (thumbnail != null) 'th': base64Encode(thumbnail!),
      };
}

class ReplyPreview {
  const ReplyPreview({
    required this.id,
    required this.kind,
    required this.snippet,
    this.senderId,
    this.revoked = false,
  });

  /// The quote of [m] as the composer and the sending bubble show it.
  factory ReplyPreview.of(ChatMessage m) => ReplyPreview(
        id: m.id,
        senderId: m.senderId,
        kind: m.kind,
        snippet: m.kind == MessageKind.text ? m.body : '',
        revoked: m.revoked,
      );

  final String id;
  final String? senderId;
  final MessageKind kind;

  /// First characters of a text; empty for media.
  final String snippet;
  final bool revoked;
}

/// Owner 2026-10-20: one emoji with how many people chose it.
@immutable
class MessageReaction {
  const MessageReaction({
    required this.emoji,
    required this.count,
    required this.mine,
  });

  final String emoji;
  final int count;
  final bool mine;
}

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
    this.attachment,
    this.sentByAssistant,
    this.sticker,
    this.contact,
    this.post,
    this.editedAt,
    this.revoked = false,
    this.forwarded = false,
    this.forwardedFrom,
    this.replyTo,
    this.reactions = const [],
    this.pinned = false,
    this.expiresAt,
    this.unreadable = false,
    this.seq,
    this.e2ee = false,
    this.sealedLink,
  });

  /// Third pass S3: the message came end-to-end encrypted. Its link card is
  /// only [sealedLink] (from the sender); the server is never asked.
  final bool e2ee;

  /// The link card the sender put inside the encryption (null = none).
  final SealedLinkCard? sealedLink;

  /// Per-chat sequence number 1, 2, 3, … from the server (null: an old copy
  /// or a message from before numbering). See [hasSeqGap].
  final int? seq;

  /// Owner 2026-10-22: the server handed back a sealed `enc:v2…` body it
  /// could not open. [body] is then '' and a text bubble says «Couldn't
  /// decrypt this message» — the ciphertext is never shown.
  final bool unreadable;

  /// Owner 2026-10-20: set for [MessageKind.contact] (null when that
  /// attorney is gone).
  final ContactCard? contact;

  /// Owner 2026-10-21: set for [MessageKind.post].
  final SharedPostCard? post;

  /// Edited at (the bubble says "edited").
  final DateTime? editedAt;

  /// Deleted for everyone: the bubble says "Message deleted".
  final bool revoked;
  final bool forwarded;

  /// Telegram's "Forwarded from <name>": the first author.
  final String? forwardedFrom;
  final ReplyPreview? replyTo;
  final List<MessageReaction> reactions;
  final bool pinned;

  /// Owner 2026-10-21: disappearing messages — the app hides the message
  /// from this time on (the server deletes it a little later).
  final DateTime? expiresAt;

  /// Gone by the clock: hidden from lists and previews.
  bool isExpired([DateTime? now]) =>
      expiresAt != null && !expiresAt!.isAfter(now ?? DateTime.now());

  /// Owner 2026-10-01: set for [MessageKind.sticker].
  final ChatSticker? sticker;

  /// OQ-048: sent by the attorney's assistant — their name.
  final String? sentByAssistant;

  /// Set for [MessageKind.attachment].
  final ChatAttachment? attachment;

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
    ChatAttachment? attachment,
    DeliveryState? delivery,
    String? failedCode,
    DateTime? editedAt,
    bool? revoked,
    bool? forwarded,
    String? forwardedFrom,
    ReplyPreview? replyTo,
    List<MessageReaction>? reactions,
    bool? pinned,
    String? body,
  }) =>
      ChatMessage(
        id: id,
        conversationId: conversationId,
        senderId: senderId,
        kind: kind,
        body: body ?? this.body,
        createdAt: createdAt,
        contactMasked: contactMasked,
        clientMessageId: clientMessageId,
        editedAt: editedAt ?? this.editedAt,
        revoked: revoked ?? this.revoked,
        forwarded: forwarded ?? this.forwarded,
        forwardedFrom: forwardedFrom ?? this.forwardedFrom,
        replyTo: replyTo ?? this.replyTo,
        reactions: reactions ?? this.reactions,
        pinned: pinned ?? this.pinned,
        expiresAt: expiresAt,
        delivery: delivery ?? this.delivery,
        failedCode: failedCode ?? this.failedCode,
        voice: voice ?? this.voice,
        callLog: callLog,
        attachment: attachment ?? this.attachment,
        sentByAssistant: sentByAssistant,
        sticker: sticker,
        contact: contact,
        post: post,
        unreadable: unreadable,
        seq: seq,
        e2ee: e2ee,
        sealedLink: sealedLink,
      );
}

/// Whether [incoming] skips a number after the newest one in [known]
/// (41, 42, then 44: 43 is missing and must be fetched). Messages without
/// a number never signal a gap.
bool hasSeqGap(Iterable<ChatMessage> known, ChatMessage incoming) {
  final n = incoming.seq;
  if (n == null) return false;
  var top = 0;
  for (final m in known) {
    final s = m.seq;
    if (!m.isLocal && s != null && s > top) top = s;
  }
  return top > 0 && n > top + 1;
}

/// Owner 2026-10-22: the at-rest envelope of a chat body
/// (MessageBodyCipher: `enc:v2.<kid>.<iv>.<tag>.<ct>`, ct empty for an
/// empty caption). A body of this shape reaching the app is ciphertext the
/// server failed to open — under a photo it looked like `enc:v2.m1.oSY…`.
final _sealedBody = RegExp(r'^enc:v\d+\.[\w-]+\.[\w-]+\.[\w-]+\.[\w-]*$');

/// True when [body] is a sealed (undecrypted) message body.
bool isSealedChatBody(String body) => _sealedBody.hasMatch(body);

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

/// A system line's text: `key`, or `key:cents` for the payment lines
/// (owner 2026-10-05: «Выставлен счёт на $500», «Оплачено $500»). Without
/// [formats] (inbox previews) the amount is plain dollars.
String systemLineText(Translator t, String body, {L10nFormats? formats}) {
  final i = body.indexOf(':');
  if (i < 0) return t.t('chat.system.$body');
  // Owner 2026-10-20: `consult:<booking id>` — the id is not text.
  if (body.startsWith('consult:')) return t.t('chat.system.consult');
  final raw = body.substring(i + 1);
  final key = body.substring(0, i);
  final cents = int.tryParse(raw);
  if (cents == null) {
    // A fee-payer option (client | attorney | split) or any other word.
    return t.t('chat.system.$key', {'payer': t.t('cpay.feePayerOf.$raw')});
  }
  final amount = formats?.currencyFromCents(cents) ??
      '\$${(cents / 100).toStringAsFixed(2)}';
  return t.t('chat.system.$key', {'amount': amount});
}

/// Instagram / Telegram: one entry per person, however many chats (a direct
/// one and case chats) we have with them; the most recent chat wins. Chats
/// with no known person id stay as they are. Used by the share and forward
/// sheets.
List<Conversation> onePerPerson(List<Conversation> chats) {
  DateTime at(Conversation c) => c.lastMessageAt ?? c.updatedAt;
  final newest = <String, Conversation>{};
  for (final c in chats) {
    final id = c.counterpart.id;
    if (id == null) continue;
    final cur = newest[id];
    if (cur == null || at(c).isAfter(at(cur))) newest[id] = c;
  }
  return [
    for (final c in chats)
      if (c.counterpart.id == null || identical(newest[c.counterpart.id], c)) c,
  ];
}
