// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart'
    show openCaseDocument;
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;

/// The tabs of the chat's files screen (owner 2026-10-18, WhatsApp:
/// «Медиа, ссылки и документы»).
enum ChatFilesTab { media, documents, links, voice }

/// A link found in a text message.
@immutable
class ChatLink {
  const ChatLink({
    required this.url,
    required this.domain,
    required this.message,
  });

  final String url;
  final String domain;
  final ChatMessage message;
}

final _urlRe = RegExp(r'(?:https?://|www\.)[^\s<>"]+', caseSensitive: false);

/// Every URL in the text messages of [messages] (newest first as given),
/// without trailing punctuation; `www.` gets `https://`.
List<ChatLink> extractChatLinks(Iterable<ChatMessage> messages) {
  final out = <ChatLink>[];
  for (final m in messages) {
    if (m.kind != MessageKind.text) continue;
    for (final match in _urlRe.allMatches(m.body)) {
      var raw = match.group(0)!;
      while (raw.isNotEmpty && '.,;:!?)]}»"\''.contains(raw[raw.length - 1])) {
        raw = raw.substring(0, raw.length - 1);
      }
      final url = raw.toLowerCase().startsWith('www.') ? 'https://$raw' : raw;
      final host = Uri.tryParse(url)?.host ?? '';
      if (host.isEmpty) continue;
      out.add(
        ChatLink(
          url: url,
          domain: host.startsWith('www.') ? host.substring(4) : host,
          message: m,
        ),
      );
    }
  }
  return out;
}

/// OQ-047 + owner 2026-10-18: every photo, video, document, link and voice
/// note of a chat in four tabs. Photos, videos and documents come from the
/// attachments feed; links and voice notes from the chat's messages (older
/// pages are fetched while those tabs are open).
class ChatFilesScreen extends ConsumerStatefulWidget {
  const ChatFilesScreen({
    required this.conversationId,
    this.initialTab = ChatFilesTab.media,
    super.key,
  });

  final String conversationId;
  final ChatFilesTab initialTab;

  @override
  ConsumerState<ChatFilesScreen> createState() => _ChatFilesScreenState();
}

class _ChatFilesScreenState extends ConsumerState<ChatFilesScreen>
    with SingleTickerProviderStateMixin {
  final _items = <ChatMessage>[];
  String? _cursor;
  bool _loading = true;
  bool _done = false;
  Object? _error;
  ChatStorageSummary? _storage;
  late final TabController _tabs = TabController(
    length: ChatFilesTab.values.length,
    vsync: this,
    initialIndex: widget.initialTab.index,
  )
    ..addListener(_onTab)
    // The pages follow the tab row (a tap slides them to the tab).
    ..addListener(_rebuild);

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _load();
    _loadStorage();
    _onTab();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  /// Links and voice notes live in the thread: fetch its older pages.
  void _onTab() {
    final tab = ChatFilesTab.values[_tabs.index];
    if (tab != ChatFilesTab.links && tab != ChatFilesTab.voice) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _fetchOlder());
  }

  Future<void> _fetchOlder() async {
    final notifier =
        ref.read(chatThreadProvider(widget.conversationId).notifier);
    for (var i = 0; i < 40 && mounted; i++) {
      final s = ref.read(chatThreadProvider(widget.conversationId));
      if (s.nextCursor == null || s.loadMoreFailed || s.loadingMore) break;
      await notifier.loadMore();
    }
  }

  /// The summary is a nicety: the list works without it.
  Future<void> _loadStorage() async {
    try {
      final s =
          await ref.read(chatRepositoryProvider).storage(widget.conversationId);
      if (mounted) setState(() => _storage = s);
    } on Object {
      // Older API or offline: no summary line.
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ref
          .read(chatRepositoryProvider)
          .attachments(widget.conversationId, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _done = page.nextCursor == null;
        _loading = false;
      });
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  bool _onScroll(ScrollNotification n) {
    if (n.metrics.extentAfter < 400 && !_loading && !_done) _load();
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final thread = ref.watch(chatThreadProvider(widget.conversationId));
    final media = [
      for (final m in _items)
        if (m.attachment != null &&
            (m.attachment!.isImage || m.attachment!.isVideo))
          m,
    ];
    final docs = [
      for (final m in _items)
        if (m.attachment != null &&
            !m.attachment!.isImage &&
            !m.attachment!.isVideo)
          m,
    ];
    final links = extractChatLinks(thread.all);
    final voice = [
      for (final m in thread.all)
        if (m.kind == MessageKind.voice && m.voice != null) m,
    ];
    final more = !_done || thread.nextCursor != null;

    String plus(int n, {required bool partial}) => partial ? '$n+' : '$n';

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('contact.mediaLinksDocs')),
      ),
      body: Column(
        children: [
          TabBar(
            controller: _tabs,
            labelColor: colors.text,
            unselectedLabelColor: colors.textSecondary,
            // Owner 2026-10-19: no line under the tabs; the chosen one is
            // told by its text colour (it follows the swipe).
            indicator: const BoxDecoration(),
            dividerColor: colors.border,
            labelStyle: type.bodySmall.copyWith(fontWeight: FontWeight.w700),
            unselectedLabelStyle: type.bodySmall,
            tabs: [
              Tab(text: t.t('files.tab.media')),
              Tab(text: t.t('files.tab.documents')),
              Tab(text: t.t('files.tab.links')),
              Tab(text: t.t('files.tab.voice')),
            ],
          ),
          Expanded(
            // Owner 2026-10-19 (Instagram): the next section slides in with
            // the finger, a tap slides to it, each keeps its scroll.
            child: SwipePages<ChatFilesTab>(
              value: ChatFilesTab.values[_tabs.index],
              values: ChatFilesTab.values,
              onChanged: (v) => _tabs.animateTo(v.index),
              pageBuilder: (_, tab) => switch (tab) {
                ChatFilesTab.media => SharedMediaTab(
                    media: media,
                    storage: _storage,
                    loading: _loading,
                    error: _error,
                    onRetry: _load,
                    onScroll: _onScroll,
                    countLabel: t.t('files.count.media', {
                      'photos': plus(
                        media.where((m) => m.attachment!.isImage).length,
                        partial: !_done,
                      ),
                      'videos': plus(
                        media.where((m) => m.attachment!.isVideo).length,
                        partial: !_done,
                      ),
                    }),
                  ),
                ChatFilesTab.documents => SharedDocsTab(
                    docs: docs,
                    loading: _loading,
                    error: _error,
                    onRetry: _load,
                    onScroll: _onScroll,
                    countLabel: t.t('files.count.documents', {
                      'n': plus(docs.length, partial: !_done),
                    }),
                  ),
                ChatFilesTab.links => SharedLinksTab(
                    links: links,
                    loading: thread.loadingMore || (thread.loading && more),
                    countLabel: t.t('files.count.links', {
                      'n': plus(
                        links.length,
                        partial: thread.nextCursor != null,
                      ),
                    }),
                  ),
                ChatFilesTab.voice => _VoiceTab(
                    voice: voice,
                    conversationId: widget.conversationId,
                    loading: thread.loadingMore,
                    countLabel: t.t('files.count.voice', {
                      'n': plus(
                        voice.length,
                        partial: thread.nextCursor != null,
                      ),
                    }),
                  ),
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _CountLine extends StatelessWidget {
  const _CountLine(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.sm,
      ),
      child: Text(
        text,
        key: const ValueKey('files-count'),
        style: type.bodySmall.copyWith(color: colors.textSecondary),
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
}

/// A tab's body: error + retry, empty message, or [child] (a scroll view).
Widget _tabBody({
  required BuildContext context,
  required WidgetRef ref,
  required bool empty,
  required bool loading,
  required Object? error,
  required VoidCallback? onRetry,
  required String emptyText,
  required Widget child,
}) {
  final t = ref.read(translatorProvider);
  if (empty && error != null) {
    return Center(
      child: TextButton(onPressed: onRetry, child: Text(t.t('error.retry'))),
    );
  }
  if (empty && loading) return const _Spinner();
  if (empty) {
    return AppEmptyState(icon: AppIcons.folderOpenRounded, message: emptyText);
  }
  return child;
}

class SharedMediaTab extends ConsumerWidget {
  const SharedMediaTab({
    required this.media,
    required this.storage,
    required this.loading,
    required this.error,
    required this.onRetry,
    required this.onScroll,
    required this.countLabel,
    super.key,
  });

  final List<ChatMessage> media;
  final ChatStorageSummary? storage;
  final bool loading;
  final Object? error;
  final VoidCallback onRetry;
  final bool Function(ScrollNotification) onScroll;
  final String countLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final photoUrls = [
      for (final m in media)
        if (m.attachment!.isImage && m.attachment!.url != null)
          m.attachment!.url!,
    ];
    return _tabBody(
      context: context,
      ref: ref,
      empty: media.isEmpty,
      loading: loading,
      error: error,
      onRetry: onRetry,
      emptyText: t.t('files.empty.media'),
      child: NotificationListener<ScrollNotification>(
        onNotification: onScroll,
        child: CustomScrollView(
          key: const ValueKey('files-media'),
          slivers: [
            if (storage != null)
              SliverToBoxAdapter(child: _StorageSummary(storage: storage!)),
            SliverToBoxAdapter(child: _CountLine(countLabel)),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              sliver: SliverGrid.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisSpacing: 2,
                  crossAxisSpacing: 2,
                ),
                itemCount: media.length,
                itemBuilder: (context, i) {
                  final a = media[i].attachment!;
                  if (a.isVideo) {
                    return ChatVideoTile(
                      key: ValueKey('media-video-${media[i].id}'),
                      attachment: a,
                      sending: false,
                      fill: true,
                      playLabel: t.t('files.play'),
                    );
                  }
                  return AppPressable(
                    key: ValueKey('media-photo-${media[i].id}'),
                    onTap: a.url == null
                        ? () {}
                        : () => showPhotoGallery(
                              context,
                              urls: photoUrls,
                              initial: photoUrls.indexOf(a.url!),
                              closeLabel: t.t('common.close'),
                            ),
                    child: a.previewUrl == null
                        ? ColoredBox(color: colors.skeletonBase)
                        : Image(
                            image: appNetworkImage(a.previewUrl!, 450),
                            fit: BoxFit.cover,
                          ),
                  );
                },
              ),
            ),
            if (loading) const SliverToBoxAdapter(child: _Spinner()),
            const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
          ],
        ),
      ),
    );
  }
}

class SharedDocsTab extends ConsumerWidget {
  const SharedDocsTab({
    required this.docs,
    required this.loading,
    required this.error,
    required this.onRetry,
    required this.onScroll,
    required this.countLabel,
    this.emptyText,
    this.listKey = const ValueKey('files-docs'),
    this.onOpen,
    super.key,
  });

  /// Overrides «No documents» (the group's voice tab lists audio files).
  final String? emptyText;

  /// Replaces opening a file outside the app (owner 2026-10-21: a group
  /// that restricts saving content says so instead).
  final void Function(ChatMessage message)? onOpen;
  final Key listKey;
  final List<ChatMessage> docs;
  final bool loading;
  final Object? error;
  final VoidCallback onRetry;
  final bool Function(ScrollNotification) onScroll;
  final String countLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return _tabBody(
      context: context,
      ref: ref,
      empty: docs.isEmpty,
      loading: loading,
      error: error,
      onRetry: onRetry,
      emptyText: emptyText ?? t.t('files.empty.documents'),
      child: NotificationListener<ScrollNotification>(
        onNotification: onScroll,
        child: CustomScrollView(
          key: listKey,
          slivers: [
            SliverToBoxAdapter(child: _CountLine(countLabel)),
            SliverList.builder(
              itemCount: docs.length,
              itemBuilder: (context, i) {
                final m = docs[i];
                final a = m.attachment!;
                final look = docLook(a.extension);
                return ListTile(
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: look.color,
                      borderRadius: BorderRadius.circular(AppRadii.button),
                    ),
                    child: AppIcon(look.icon, color: Colors.white, size: 20),
                  ),
                  title: Text(
                    a.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.bodySmall.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: Text(
                    '${fileSizeLabel(a.sizeBytes)} · ${f.date(m.createdAt)}',
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  trailing: AppIcon(
                    AppIcons.openInNewRounded,
                    color: colors.textSecondary,
                  ),
                  onTap: a.url == null
                      ? null
                      : onOpen != null
                          ? () => onOpen!(m)
                          : () => openCaseDocument(a.url!),
                );
              },
            ),
            if (loading) const SliverToBoxAdapter(child: _Spinner()),
            const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
          ],
        ),
      ),
    );
  }
}

class SharedLinksTab extends ConsumerWidget {
  const SharedLinksTab({
    required this.links,
    required this.loading,
    required this.countLabel,
    this.onScroll,
    super.key,
  });

  final bool Function(ScrollNotification)? onScroll;
  final List<ChatLink> links;
  final bool loading;
  final String countLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return _tabBody(
      context: context,
      ref: ref,
      empty: links.isEmpty,
      loading: loading,
      error: null,
      onRetry: null,
      emptyText: t.t('files.empty.links'),
      child: NotificationListener<ScrollNotification>(
        onNotification: onScroll ?? (_) => false,
        child: ListView(
          key: const ValueKey('files-links'),
          padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
          children: [
            _CountLine(countLabel),
            for (final l in links)
              ListTile(
                key: ValueKey('link-${l.message.id}-${l.url}'),
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(AppRadii.button),
                    border: Border.all(color: colors.border),
                  ),
                  child: AppIcon(
                    AppIcons.linkRounded,
                    color: colors.iconTint,
                    size: 20,
                  ),
                ),
                title: Text(
                  l.domain,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.bodySmall.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(
                  '${l.url} · ${f.date(l.message.createdAt)}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
                onTap: () => openCaseDocument(l.url),
              ),
            if (loading) const _Spinner(),
          ],
        ),
      ),
    );
  }
}

class _VoiceTab extends ConsumerWidget {
  const _VoiceTab({
    required this.voice,
    required this.conversationId,
    required this.loading,
    required this.countLabel,
  });

  final List<ChatMessage> voice;
  final String conversationId;
  final bool loading;
  final String countLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final me = ref.watch(currentUserIdProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final playback = ref.watch(voicePlayerProvider);
    final other =
        ref.watch(chatThreadProvider(conversationId)).conversation?.counterpart;
    return _tabBody(
      context: context,
      ref: ref,
      empty: voice.isEmpty,
      loading: loading,
      error: null,
      onRetry: null,
      emptyText: t.t('files.empty.voice'),
      child: ListView(
        key: const ValueKey('files-voice'),
        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
        children: [
          _CountLine(countLabel),
          for (final m in voice)
            Builder(
              builder: (context) {
                final v = m.voice!;
                final active = playback.messageId == m.id;
                final playing = active && playback.playing;
                final total = voiceLength(v);
                final shown = active && playback.position > Duration.zero
                    ? playback.position
                    : total;
                final mine = m.senderId == me;
                final who = mine
                    ? t.t('chat.you')
                    : (other?.displayName ??
                        (other?.username == null
                            ? ''
                            : atHandle(other!.username)));
                final playable = v.url != null || v.localPath != null;
                return ListTile(
                  key: ValueKey('voice-${m.id}'),
                  leading: Semantics(
                    button: true,
                    label: t.t(playing ? 'files.pause' : 'files.play'),
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: colors.text,
                        shape: BoxShape.circle,
                      ),
                      child: AppIcon(
                        playing
                            ? AppIcons.pauseRounded
                            : AppIcons.playArrowRounded,
                        color: colors.bg,
                        size: 22,
                      ),
                    ),
                  ),
                  title: Text(
                    who,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.bodySmall.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: Text(
                    '${voiceClock(shown)} · ${f.date(m.createdAt)}',
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  onTap: playable
                      ? () => ref.read(voicePlayerProvider.notifier).toggle(m)
                      : null,
                );
              },
            ),
          if (loading) const _Spinner(),
        ],
      ),
    );
  }
}

/// "Photos: 12 · Documents: 3 · Voice: 5" and how much the chat's files
/// take (with a bar when the chat has a cap). Wraps in every language.
class _StorageSummary extends ConsumerWidget {
  const _StorageSummary({required this.storage});

  final ChatStorageSummary storage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final quota = storage.quotaBytes;
    final used = fileSizeLabel(storage.usedBytes);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.t('chat.files.summary.counts', {
              'photos': '${storage.photos}',
              'documents': '${storage.documents}',
              'voice': '${storage.voice}',
            }),
            style: type.bodySmall.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            quota == null
                ? t.t('chat.files.summary.used', {'used': used})
                : t.t('chat.files.summary.usedOf', {
                    'used': used,
                    'quota': fileSizeLabel(quota),
                  }),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          if (quota != null && quota > 0) ...[
            const SizedBox(height: AppSpacing.xs),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (storage.usedBytes / quota).clamp(0, 1).toDouble(),
                minHeight: 4,
                backgroundColor: colors.skeletonBase,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
