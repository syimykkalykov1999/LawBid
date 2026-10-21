import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart'
    show SwipePages;
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_files_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The group message as the shared-media tabs draw it.
ChatMessage groupSharedMessage(api.GroupMessageDto m) {
  final a = m.attachment;
  return ChatMessage(
    id: m.id,
    conversationId: m.groupId,
    kind: a == null ? MessageKind.text : MessageKind.attachment,
    body: m.body,
    createdAt: m.createdAt,
    senderId: m.sender?.userId,
    attachment: a == null
        ? null
        : ChatAttachment(
            fileId: a.fileId,
            name: a.name,
            isImage: a.isImage,
            mime: a.mime,
            sizeBytes: a.sizeBytes,
            url: a.url,
            previewUrl: a.previewUrl,
            width: a.width,
            height: a.height,
          ),
  );
}

/// One tab's pages, loaded from the server by cursor.
class _Feed {
  final items = <ChatMessage>[];
  String? cursor;
  bool loading = false;
  bool done = false;
  Object? error;
}

/// Owner 2026-10-21 (Telegram «shared media»): photos and videos, files,
/// links and voice notes of a group, one server-paged list per tab.
class GroupFilesScreen extends ConsumerStatefulWidget {
  const GroupFilesScreen({
    required this.groupId,
    this.initialTab = ChatFilesTab.media,
    super.key,
  });

  final String groupId;
  final ChatFilesTab initialTab;

  @override
  ConsumerState<GroupFilesScreen> createState() => _GroupFilesScreenState();
}

class _GroupFilesScreenState extends ConsumerState<GroupFilesScreen>
    with SingleTickerProviderStateMixin {
  final _feeds = {for (final t in ChatFilesTab.values) t: _Feed()};
  late final TabController _tabs = TabController(
    length: ChatFilesTab.values.length,
    vsync: this,
    initialIndex: widget.initialTab.index,
  )..addListener(_onTab);

  ChatFilesTab get _tab => ChatFilesTab.values[_tabs.index];

  static api.GroupSharedKind _kind(ChatFilesTab t) => switch (t) {
        ChatFilesTab.media => api.GroupSharedKind.media,
        ChatFilesTab.documents => api.GroupSharedKind.files,
        ChatFilesTab.links => api.GroupSharedKind.links,
        ChatFilesTab.voice => api.GroupSharedKind.voice,
      };

  @override
  void initState() {
    super.initState();
    _load(_tab);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  void _onTab() {
    if (mounted) setState(() {});
    _load(_tab);
  }

  Future<void> _load(ChatFilesTab tab) async {
    final f = _feeds[tab]!;
    if (f.loading || f.done) return;
    setState(() {
      f
        ..loading = true
        ..error = null;
    });
    try {
      final page = await ref
          .read(groupRepositoryProvider)
          .shared(widget.groupId, _kind(tab), cursor: f.cursor);
      if (!mounted) return;
      setState(() {
        f
          ..items.addAll(page.items.map(groupSharedMessage))
          ..cursor = page.nextCursor
          ..done = page.nextCursor == null
          ..loading = false;
      });
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          f
            ..error = e
            ..loading = false;
        });
      }
    }
  }

  bool Function(ScrollNotification) _scroll(ChatFilesTab tab) => (n) {
        final f = _feeds[tab]!;
        if (n.metrics.extentAfter < 400 && f.error == null) _load(tab);
        return false;
      };

  String _plus(_Feed f, int n) => f.done ? '$n' : '$n+';

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final media = _feeds[ChatFilesTab.media]!;
    final docs = _feeds[ChatFilesTab.documents]!;
    final links = _feeds[ChatFilesTab.links]!;
    final voice = _feeds[ChatFilesTab.voice]!;
    final found = extractChatLinks(links.items);
    // Owner 2026-10-21 (Telegram «Запретить копирование»): files of a
    // protected group are not opened outside the app.
    final protected =
        ref.watch(groupDetailProvider(widget.groupId)).value?.isProtected ??
            false;
    final blockOpen = protected
        ? (ChatMessage _) =>
            showAppSnackBar(context, t.t('chat.forward.protected'))
        : null;

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
            child: SwipePages<ChatFilesTab>(
              value: _tab,
              values: ChatFilesTab.values,
              onChanged: (v) => _tabs.animateTo(v.index),
              pageBuilder: (_, tab) => switch (tab) {
                ChatFilesTab.media => SharedMediaTab(
                    media: media.items,
                    storage: null,
                    loading: media.loading,
                    error: media.error,
                    onRetry: () => _load(tab),
                    onScroll: _scroll(tab),
                    countLabel: t.t('files.count.media', {
                      'photos': _plus(
                        media,
                        media.items.where((m) => m.attachment!.isImage).length,
                      ),
                      'videos': _plus(
                        media,
                        media.items.where((m) => m.attachment!.isVideo).length,
                      ),
                    }),
                  ),
                ChatFilesTab.documents => SharedDocsTab(
                    docs: docs.items,
                    loading: docs.loading,
                    error: docs.error,
                    onRetry: () => _load(tab),
                    onScroll: _scroll(tab),
                    onOpen: blockOpen,
                    countLabel: t.t('files.count.documents', {
                      'n': _plus(docs, docs.items.length),
                    }),
                  ),
                ChatFilesTab.links => SharedLinksTab(
                    links: found,
                    loading: links.loading,
                    onScroll: _scroll(tab),
                    countLabel: t.t('files.count.links', {
                      'n': _plus(links, found.length),
                    }),
                  ),
                ChatFilesTab.voice => SharedDocsTab(
                    listKey: const ValueKey('files-voice'),
                    docs: voice.items,
                    loading: voice.loading,
                    error: voice.error,
                    onRetry: () => _load(tab),
                    onScroll: _scroll(tab),
                    emptyText: t.t('files.empty.voice'),
                    onOpen: blockOpen,
                    countLabel: t.t('files.count.voice', {
                      'n': _plus(voice, voice.items.length),
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
