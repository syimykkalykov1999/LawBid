import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/chat_media_index.dart';
import 'package:lawbid/core/cache/chat_media_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/byte_size.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';

/// Owner 2026-11-02 (Telegram «Данные и память» → by chat): how much of the
/// chat pictures on the phone each chat takes, with «Очистить» per chat.
/// Pictures that belong to no known chat are one row at the end.
final chatMediaUsageProvider = FutureProvider.autoDispose<List<ChatMediaUsage>>(
  (ref) => ref.watch(chatMediaIndexProvider).usage(),
);

class ChatMediaScreen extends ConsumerWidget {
  const ChatMediaScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final usage = ref.watch(chatMediaUsageProvider);
    final items = ref.watch(conversationsProvider).value?.items;
    final titles = <String, String>{};
    for (final c in items ?? const <Conversation>[]) {
      final title = c.counterpart.displayName ?? c.caseTitle;
      if (title != null) titles[c.id] = title;
    }
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('storage.cat.chat_media')),
      ),
      body: usage.when(
        loading: () => Center(child: Text(t.t('storage.measuring'))),
        error: (_, __) => Center(
          child: TextButton(
            onPressed: () => ref.invalidate(chatMediaUsageProvider),
            child: Text(t.t('common.retry')),
          ),
        ),
        data: (rows) {
          // A chat the list does not hold (older than the loaded pages) has
          // no name to show: those go into one «Прочее» row.
          final named = [
            for (final r in rows)
              if (titles[r.conversationId] != null) r,
          ];
          final others = [
            for (final r in rows)
              if (titles[r.conversationId] == null) r,
          ];
          final otherBytes = others.fold<int>(0, (a, r) => a + r.bytes);
          return ListView(
            padding: const EdgeInsets.only(bottom: AppSpacing.xl),
            children: [
              for (final r in named)
                _Row(
                  key: ValueKey('chat-media-${r.conversationId}'),
                  label: titles[r.conversationId]!,
                  bytes: r.bytes,
                  onClear: () =>
                      _confirmClear(context, ref, [r.conversationId]),
                ),
              if (others.isNotEmpty)
                _Row(
                  key: const ValueKey('chat-media-other'),
                  label: t.t('storage.cat.other'),
                  bytes: otherBytes,
                  onClear: () => _confirmClear(
                    context,
                    ref,
                    [for (final r in others) r.conversationId],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  static Future<void> _confirmClear(
    BuildContext context,
    WidgetRef ref,
    List<String> ids,
  ) async {
    final t = ref.read(translatorProvider);
    final ok = await showAppDialog<bool>(
      context: context,
      builder: (dialog) => AppAlertDialog(
        title: Text(t.t('storage.clear.confirm.title')),
        content: Text(t.t('storage.clear.confirm.body')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            key: const ValueKey('chat-media-clear-confirm'),
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(t.t('storage.clear.row')),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _clear(ref, ids);
  }

  static Future<void> _clear(WidgetRef ref, List<String> ids) async {
    await ref.read(chatMediaIndexProvider).clear(ids);
    ref
      ..invalidate(chatMediaUsageProvider)
      ..invalidate(cacheReportProvider);
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.bytes,
    required this.onClear,
    super.key,
  });

  final String label;
  final int bytes;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Consumer(
        builder: (context, ref, _) {
          final t = ref.watch(translatorProvider);
          return AppListRow(
            icon: AppIcons.chatBubbleOutlineRounded,
            label: label,
            subtitle: byteSizeLabel(bytes),
            trailingText: t.t('storage.clear.row'),
            showChevron: false,
            onTap: onClear,
          );
        },
      );
}
