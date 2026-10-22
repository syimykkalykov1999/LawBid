// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/disappearing.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:lawbid/features/chat/presentation/disappearing_sheet.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// Owner 2026-10-18: online / last seen of the other side, live while the
/// chat is open (null = not shown: hidden status, anonymous client).
PresenceView? chatPresenceOf(WidgetRef ref, Conversation c) {
  final otherId = c.counterpart.id;
  final live = otherId == null || c.counterpart.online == null
      ? null
      : ref.watch(presenceProvider(otherId));
  return live ??
      (c.counterpart.online == null
          ? null
          : PresenceView(
              online: c.counterpart.online!,
              lastSeenAt: c.counterpart.lastSeenAt,
            ));
}

/// The audio-call button's conditions (OQ-041/043, audits 2026-10-02 and
/// 2026-10-04): after acceptance, not across a block, not for an assistant
/// without the "calls" duty.
bool chatAudioCallAllowed(WidgetRef ref, Conversation c) =>
    !c.closed &&
    c.contactsUnlocked &&
    !c.blockedHere &&
    !c.myRequestPending &&
    !c.awaitingMyAnswer &&
    !c.myRequestDeclined &&
    ref.watch(canDoProvider(AssistantDuty.calls)) &&
    !(ref.watch(blockedIdsProvider).value?.contains(c.counterpart.id) ?? false);

/// Where a tap on the case opens (the work card for the hired attorney).
String chatCaseRoute(Conversation c, {required bool attorney}) {
  final caseId = c.caseId!;
  return !attorney
      ? AppRoutes.myCase(caseId)
      : c.contactsUnlocked
          ? AppRoutes.workCase(caseId)
          : AppRoutes.caseDetail(caseId);
}

/// Opens the contact screen of the chat.
Future<void> openContactInfo(
  BuildContext context, {
  required String conversationId,
  VoidCallback? onCall,
}) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => webPageRoute(
          ContactInfoScreen(conversationId: conversationId, onCall: onCall),
        ),
      ),
    );

/// Owner 2026-10-18 (WhatsApp «Данные контакта»): the big photo, name and
/// status, round actions (Profile · Audio), «Медиа, ссылки и документы»
/// with the latest thumbnails, the case, mute / pin / note, then block and
/// report. A client hidden before acceptance shows no photo and no profile.
class ContactInfoScreen extends ConsumerStatefulWidget {
  const ContactInfoScreen({
    required this.conversationId,
    this.onCall,
    super.key,
  });

  final String conversationId;

  /// Starts the audio call (the conversation screen owns call plumbing).
  final VoidCallback? onCall;

  @override
  ConsumerState<ContactInfoScreen> createState() => _ContactInfoScreenState();
}

class _ContactInfoScreenState extends ConsumerState<ContactInfoScreen> {
  List<ChatMessage> _media = const [];
  ChatStorageSummary? _storage;

  @override
  void initState() {
    super.initState();
    _loadMedia();
  }

  /// Nicety: without them the section is just the row.
  Future<void> _loadMedia() async {
    final repo = ref.read(chatRepositoryProvider);
    try {
      final page = await repo.attachments(widget.conversationId);
      if (mounted) {
        setState(() {
          _media = [
            for (final m in page.items)
              if (m.attachment != null &&
                  (m.attachment!.isImage || m.attachment!.isVideo))
                m,
          ];
        });
      }
    } on Object {
      // Offline: no thumbnails.
    }
    try {
      final s = await repo.storage(widget.conversationId);
      if (mounted) setState(() => _storage = s);
    } on Object {
      // Older API: no count.
    }
  }

  ChatThread get _thread =>
      ref.read(chatThreadProvider(widget.conversationId).notifier);

  Future<void> _openFiles({ChatFilesTab tab = ChatFilesTab.media}) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => webPageRoute(
            ChatFilesScreen(
              conversationId: widget.conversationId,
              initialTab: tab,
            ),
          ),
        ),
      );

  Future<void> _mute(Conversation c) async {
    final t = ref.read(translatorProvider);
    final pick = await pickMute(context, t, muted: c.muted);
    if (pick == null || !mounted) return;
    final span = muteDuration(pick);
    final until = span == null ? null : DateTime.now().add(span);
    try {
      await _thread.setMutedUntil(until);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _muteCalls(Conversation c) async {
    final t = ref.read(translatorProvider);
    try {
      await _thread.setCallsMuted(!c.callsMuted);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  /// Owner 2026-10-21: WhatsApp's «Disappearing messages» (direct chats).
  Future<void> _disappearing(Conversation c) async {
    final t = ref.read(translatorProvider);
    final picked =
        await pickDisappearing(context, t, current: c.disappearAfterS);
    if (picked == null || !mounted) return;
    try {
      await _thread.setDisappearing(picked == 0 ? null : picked);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _pin(Conversation c) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(chatRepositoryProvider).organize(c.id, pinned: !c.pinned);
      refreshChatFolders(ref);
      ref.invalidate(chatThreadProvider(widget.conversationId));
      if (mounted) {
        showAppSnackBar(
          context,
          t.t(c.pinned ? 'chat.organize.unpinned' : 'chat.organize.pinned'),
        );
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final formats = ref.watch(l10nFormatsProvider);
    final c = ref.watch(chatThreadProvider(widget.conversationId)).conversation;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final back = AppBackButton(
      semanticLabel: t.t('common.back'),
      onPressed: () => Navigator.of(context).maybePop(),
    );
    if (c == null) {
      return Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(leading: back, title: Text(t.t('contact.title'))),
        body: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    final p = c.counterpart;
    final hidden = p.hidden;
    final presence = chatPresenceOf(ref, c);
    final name = counterpartName(t, c);
    final username = p.username;
    final canProfile = !hidden && username != null;
    final canCall = widget.onCall != null && chatAudioCallAllowed(ref, c);
    final photo = hidden ? null : (p.avatarFullUrl ?? p.avatarUrl);
    final blocked =
        ref.watch(blockedIdsProvider).value?.contains(p.id) ?? false;
    final canBlock =
        p.id != null && !(c.caseId != null && c.contactsUnlocked && !c.closed);
    final blockName =
        p.displayName ?? (username == null ? '' : atHandle(username));
    final mediaCount =
        _storage == null ? null : _storage!.photos + _storage!.documents;
    final roleLine = hidden
        ? null
        : p.isAttorney
            ? (p.verified ? t.t('post.verified') : t.t('contact.attorney'))
            : null;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(leading: back, title: Text(t.t('contact.title'))),
      body: ListView(
        key: const ValueKey('contact-info'),
        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
        children: [
          const SizedBox(height: AppSpacing.xl),
          Center(
            child: Semantics(
              button: photo != null,
              label: name,
              child: GestureDetector(
                key: const ValueKey('contact-avatar'),
                onTap: photo == null
                    ? null
                    : () => showPhotoGallery(
                          context,
                          urls: [photo],
                          closeLabel: t.t('common.close'),
                        ),
                child: CounterpartAvatar(
                  counterpart: p,
                  size: 112,
                  online: false,
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
            child: Text(
              name,
              key: const ValueKey('contact-name'),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.titleLarge.copyWith(color: colors.text),
            ),
          ),
          if (presence != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                presenceLabel(
                  t,
                  presence,
                  time: formats.time,
                  date: formats.date,
                ),
                key: const ValueKey('contact-presence'),
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(
                  color:
                      presence.online ? colors.goldDark : colors.textSecondary,
                  fontWeight: presence.online ? FontWeight.w600 : null,
                ),
              ),
            ),
          if (roleLine != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (p.verified) ...[
                    AppIcon(
                      AppIcons.verifiedRounded,
                      color: colors.goldAccent,
                      size: 16,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                  ],
                  Text(
                    roleLine,
                    key: const ValueKey('contact-role'),
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
          if (canProfile || canCall) ...[
            const SizedBox(height: AppSpacing.xl),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (canProfile)
                  _RoundAction(
                    key: const ValueKey('contact-profile'),
                    icon: AppIcons.personOutlineRounded,
                    label: t.t('contact.profile'),
                    primary: true,
                    onTap: () => context.push(
                      p.isAttorney
                          ? AppRoutes.lawyer(username)
                          : AppRoutes.client(username),
                    ),
                  ),
                if (canCall)
                  _RoundAction(
                    key: const ValueKey('contact-audio'),
                    icon: AppIcons.callOutlined,
                    label: t.t('contact.audio'),
                    onTap: widget.onCall!,
                  ),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          if (c.contactsUnlocked)
            _Section(
              children: [
                AppListRow(
                  key: const ValueKey('contact-media'),
                  icon: AppIcons.photoLibraryOutlined,
                  label: t.t('contact.mediaLinksDocs'),
                  trailingText: mediaCount == null ? null : '$mediaCount',
                  onTap: _openFiles,
                ),
                if (_media.isNotEmpty)
                  _MediaStrip(
                    media: _media,
                    playLabel: t.t('files.play'),
                    onMore: _openFiles,
                  ),
              ],
            ),
          if (c.caseId != null)
            _Section(
              children: [
                AppListRow(
                  key: const ValueKey('contact-case'),
                  icon: AppIcons.gavelOutlined,
                  label: c.caseTitle ?? t.t('contact.case'),
                  subtitle: c.caseTitle == null ? null : t.t('contact.case'),
                  onTap: () =>
                      context.push(chatCaseRoute(c, attorney: attorney)),
                ),
              ],
            ),
          _Section(
            children: [
              AppListRow(
                key: const ValueKey('contact-mute'),
                icon: c.muted
                    ? AppIcons.notificationsOffOutlined
                    : AppIcons.notificationsActiveOutlined,
                label: t.t('contact.mute'),
                trailingText: t.t(c.muted ? 'contact.on' : 'contact.off'),
                showChevron: false,
                onTap: () => _mute(c),
              ),
              if (c.caseId == null && !c.myRequestPending)
                AppListRow(
                  key: const ValueKey('contact-disappearing'),
                  icon: AppIcons.timerOutlined,
                  label: t.t('dm.title'),
                  subtitle: t.t('dm.hint'),
                  trailingText: disappearValue(t, c.disappearAfterS),
                  showChevron: false,
                  onTap: () => _disappearing(c),
                ),
              AppListRow(
                key: const ValueKey('contact-calls-mute'),
                icon: AppIcons.notificationsOffOutlined,
                label: t.t('mute.calls'),
                subtitle: t.t('mute.callsNote'),
                trailingText: t.t(c.callsMuted ? 'contact.on' : 'contact.off'),
                showChevron: false,
                onTap: () => _muteCalls(c),
              ),
              AppListRow(
                key: const ValueKey('contact-pin'),
                icon: c.pinned ? AppIcons.pushPin : AppIcons.pushPinOutlined,
                label:
                    t.t(c.pinned ? 'chat.organize.unpin' : 'chat.organize.pin'),
                showChevron: false,
                onTap: () => _pin(c),
              ),
              AppListRow(
                key: const ValueKey('contact-note'),
                icon: AppIcons.stickyNote2Outlined,
                label: t.t('contact.note'),
                subtitle: (c.note?.isNotEmpty ?? false)
                    ? c.note
                    : t.t('contact.noteEmpty'),
                onTap: () async {
                  await showChatOrganizeSheet(context, ref, c);
                  ref.invalidate(chatThreadProvider(widget.conversationId));
                },
              ),
            ],
          ),
          if (p.id != null)
            _Section(
              children: [
                if (canBlock)
                  AppListRow(
                    key: const ValueKey('contact-block'),
                    icon: blocked
                        ? AppIcons.lockOpenRounded
                        : AppIcons.blockFlipped,
                    label: t.t(
                      blocked ? 'contact.unblockName' : 'contact.blockName',
                      {'name': blockName},
                    ),
                    destructive: !blocked,
                    showChevron: false,
                    onTap: () async {
                      final changed = await toggleBlock(
                        context,
                        ref,
                        userId: p.id!,
                        displayName: blockName,
                        currentlyBlocked: blocked,
                      );
                      if (changed) {
                        ref.invalidate(
                          chatThreadProvider(widget.conversationId),
                        );
                      }
                    },
                  ),
                AppListRow(
                  key: const ValueKey('contact-report'),
                  icon: AppIcons.flagOutlined,
                  label: t.t('contact.reportName', {'name': blockName}),
                  destructive: true,
                  showChevron: false,
                  onTap: () =>
                      showReportSheet(context, ref, ReportTarget.user, p.id!),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// A round action under the name (WhatsApp): the primary one is filled
/// with the theme's text colour (never gold), the others sit on the surface.
class _RoundAction extends StatelessWidget {
  const _RoundAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: SizedBox(
          width: 88,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: primary ? colors.text : colors.surface,
                  border: primary ? null : Border.all(color: colors.border),
                ),
                child: AppIcon(
                  icon,
                  color: primary ? colors.bg : colors.text,
                  size: 26,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.text),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A rounded block of rows on the screen's background (WhatsApp groups).
class _Section extends StatelessWidget {
  const _Section({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      margin: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}

/// The latest photos / videos of the chat as a horizontal strip.
class _MediaStrip extends StatelessWidget {
  const _MediaStrip({
    required this.media,
    required this.playLabel,
    required this.onMore,
  });

  final List<ChatMessage> media;
  final String playLabel;
  final VoidCallback onMore;

  static const _size = 76.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final shown = media.take(8).toList();
    return SizedBox(
      key: const ValueKey('contact-strip'),
      height: _size + AppSpacing.md,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          0,
          AppSpacing.md,
          AppSpacing.md,
        ),
        itemCount: shown.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.xs),
        itemBuilder: (context, i) {
          final a = shown[i].attachment!;
          return ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.button),
            child: SizedBox.square(
              dimension: _size,
              child: a.isVideo
                  ? ChatVideoTile(
                      attachment: a,
                      sending: false,
                      fill: true,
                      playLabel: playLabel,
                    )
                  : AppPressable(
                      onTap: onMore,
                      child: a.previewUrl == null
                          ? ColoredBox(color: colors.skeletonBase)
                          : Image(
                              image: appNetworkImage(
                                a.previewUrl!,
                                300,
                                cache: AppImageCaches.chatMedia,
                              ),
                              fit: BoxFit.cover,
                            ),
                    ),
            ),
          );
        },
      ),
    );
  }
}
