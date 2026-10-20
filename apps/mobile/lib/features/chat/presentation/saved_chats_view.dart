import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/application/chat_saved_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/data/chat_extras_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/chat_cards.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:url_launcher/url_launcher.dart';

final _url = RegExp(r'https?://[^\s<>"]+', caseSensitive: false);

/// Owner 2026-10-20: «Saved» for chats — the messages, files, links and
/// voice notes the person kept (long press → Save), searchable, with tabs
/// All / Media / Files / Links. The same list serves both profiles.
class SavedChatsView extends ConsumerStatefulWidget {
  const SavedChatsView({super.key, this.query});

  /// Set: the screen's own search field drives the list and this view draws
  /// none. Null: this view has its own field.
  final String? query;

  @override
  ConsumerState<SavedChatsView> createState() => _SavedChatsViewState();
}

class _SavedChatsViewState extends ConsumerState<SavedChatsView> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _q = '';
  SavedChatTab _tab = SavedChatTab.all;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _changed(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _q = v.trim());
    });
  }

  String _label(SavedChatTab tab, String Function(String) t) => switch (tab) {
        SavedChatTab.all => t('chat.folder.all'),
        SavedChatTab.media => t('files.tab.media'),
        SavedChatTab.files => t('files.tab.documents'),
        SavedChatTab.links => t('files.tab.links'),
      };

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final q = widget.query?.trim() ?? _q;
    final key = (tab: _tab, query: q);
    final value = ref.watch(savedChatListProvider(key));
    final n = ref.read(savedChatListProvider(key).notifier);
    return Column(
      children: [
        if (widget.query == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.sm,
              AppSpacing.screenSide,
              AppSpacing.sm,
            ),
            child: AppTextField(
              controller: _search,
              leading: const AppIcon(AppIcons.searchRounded),
              hintText: t.t('saved.search'),
              semanticLabel: t.t('saved.search'),
              textInputAction: TextInputAction.search,
              onChanged: _changed,
            ),
          ),
        FilterChips<SavedChatTab>(
          value: _tab,
          options: [
            for (final tab in SavedChatTab.values) (tab, _label(tab, t.t)),
          ],
          onChanged: (v) => setState(() => _tab = v),
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: PagedListBody<SavedChatEntry>(
            value: value,
            t: t,
            itemKey: (e) => e.message.id,
            onRefresh: n.refresh,
            onLoadMore: n.loadMore,
            onRetryMore: n.retryLoadMore,
            skeleton: const Center(child: CircularProgressIndicator()),
            empty: AppEmptyState(
              icon: AppIcons.bookmarkOutlineRounded,
              message:
                  t.t(q.isEmpty ? 'saved.chats.empty' : 'search.empty.title'),
            ),
            itemBuilder: (context, e, _) => _SavedTile(entry: e),
          ),
        ),
      ],
    );
  }
}

class _SavedTile extends ConsumerWidget {
  const _SavedTile({required this.entry});

  final SavedChatEntry entry;

  Widget _content(BuildContext context, WidgetRef ref, Color fg) {
    final m = entry.message;
    final mine = entry.mine;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = type.body.copyWith(color: fg, height: 1.35);
    switch (m.kind) {
      case MessageKind.voice:
        final p = entry.chat.counterpart;
        return VoiceMessageBody(
          message: m,
          mine: mine,
          threadId: entry.chat.id,
          avatarUrl: mine
              ? null
              : p.hidden
                  ? null
                  : p.avatarUrl,
          avatarName: mine ? null : p.displayName ?? p.username,
        );
      case MessageKind.attachment when m.attachment != null:
        return AttachmentMessageBody(message: m, mine: mine);
      case MessageKind.contact when m.contact != null:
        return ContactCardBody(card: m.contact!, mine: mine);
      case MessageKind.place:
        return PlaceCardBody(address: m.body, mine: mine);
      case MessageKind.text ||
            MessageKind.system ||
            MessageKind.call ||
            MessageKind.sticker ||
            MessageKind.gift ||
            MessageKind.attachment ||
            MessageKind.contact:
        final link = _url.firstMatch(m.body)?.group(0);
        final text = Text(m.body, style: style);
        if (link == null) return text;
        return GestureDetector(
          onTap: () => unawaited(
            launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication)
                .catchError((_) => false),
          ),
          child: Text.rich(
            TextSpan(
              children: [
                for (final part in _split(m.body, link))
                  TextSpan(
                    text: part.$1,
                    style: part.$2
                        ? style.copyWith(decoration: TextDecoration.underline)
                        : style,
                  ),
              ],
            ),
          ),
        );
    }
  }

  /// [text] cut around the first [link]: (piece, isLink).
  static List<(String, bool)> _split(String text, String link) {
    final i = text.indexOf(link);
    return [
      if (i > 0) (text.substring(0, i), false),
      (link, true),
      if (i + link.length < text.length)
        (text.substring(i + link.length), false),
    ];
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final mine = entry.mine;
    final fg = mine ? chat.onMine : chat.onTheirs;
    final p = entry.chat.counterpart;
    final who = mine
        ? t.t('chat.you')
        : (p.hidden ? entry.chat.caseTitle : p.displayName ?? p.username) ?? '';
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.xs,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: AppPressable(
                  onTap: () =>
                      context.push(ChatRoutes.conversation(entry.chat.id)),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Text(
                      '$who · ${f.dateLong(entry.message.createdAt.toLocal())}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ),
              Semantics(
                button: true,
                label: t.t('saved.remove'),
                excludeSemantics: true,
                child: AppPressable(
                  onTap: () => unawaited(_unsave(context, ref)),
                  child: SizedBox.square(
                    dimension: 44,
                    child: Center(
                      child: AppIcon(
                        AppIcons.bookmarkRounded,
                        size: 22,
                        color: colors.iconTint,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.sizeOf(context).width * 0.86,
              ),
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: mine ? chat.mine : chat.theirs,
                borderRadius: BorderRadius.circular(16),
                border: mine ? null : Border.all(color: chat.theirsBorder),
              ),
              child: _content(context, ref, fg),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _unsave(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(savedChatIdsProvider.notifier).remove(entry.message.id);
      if (context.mounted) showAppSnackBar(context, t.t('saved.removed'));
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }
}
