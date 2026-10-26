import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/text/byte_size.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';

/// Owner 2026-10-22 (client economy plan §5.2, Telegram «Данные и
/// память»): what the app keeps on the phone, by category, with
/// «Очистить» per row and for everything; «Хранить медиа чатов»; the
/// byte limits (never above the administrator's ceiling); and today's
/// network use, so the owner can see the economy packages took effect.
class StorageScreen extends ConsumerWidget {
  const StorageScreen({super.key});

  /// The rows, in the order of the ring's colours.
  static const categories = [
    CacheStore.images,
    CacheStore.chatMedia,
    CacheStore.messages,
    CacheStore.feed,
    CacheStore.http,
    CacheStore.other,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final report = ref.watch(cacheReportProvider);
    final limits = ref.watch(cacheLimitsProvider);
    final usage = ref.watch(networkUsageTodayProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('settings.storage.title')),
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: AppSpacing.xl),
        children: [
          _UsageHeader(report: report.value, t: t),
          AppListSection(
            title: t.t('storage.section.onPhone'),
            children: [
              for (final s in categories)
                AppListRow(
                  key: ValueKey('storage-${s.configKey}'),
                  icon: _iconOf(s),
                  label: t.t('storage.cat.${s.configKey}'),
                  subtitle: report.value == null
                      ? t.t('storage.measuring')
                      : byteSizeLabel(report.value!.of(s)),
                  trailingText: t.t('storage.clear.row'),
                  showChevron: false,
                  onTap: () => _confirmClear(context, ref, t, s),
                ),
            ],
          ),
          AppListSection(
            title: t.t('storage.section.rules'),
            children: [
              AppListRow(
                key: const ValueKey('storage-keep-media'),
                icon: AppIcons.chatBubbleOutlineRounded,
                label: t.t('storage.keepMedia.title'),
                trailingText: _keepLabel(t, limits.keepMedia),
                onTap: () => _pickKeepMedia(context, ref, t, limits),
              ),
              for (final s in const [
                CacheStore.images,
                CacheStore.chatMedia,
                CacheStore.messages,
              ])
                AppListRow(
                  key: ValueKey('storage-limit-${s.configKey}'),
                  icon: _iconOf(s),
                  label: t.t(
                    'storage.limit.title',
                    {'name': t.t('storage.cat.${s.configKey}')},
                  ),
                  trailingText: '${limits.limitMb(s)} MB',
                  onTap: () => _pickLimit(context, ref, t, limits, s),
                ),
            ],
          ),
          AppListSection(
            title: t.t('storage.network.title'),
            children: [
              _NetworkRow(
                label:
                    t.t('storage.network.requests', {'n': '${usage.requests}'}),
              ),
              _NetworkRow(
                label: t.t(
                  'storage.network.bytes',
                  {'size': byteSizeLabel(usage.bytesReceived)},
                ),
              ),
              _NetworkRow(
                label: t.t(
                  'storage.network.notModified',
                  {'n': '${usage.notModified}'},
                ),
              ),
              _NetworkRow(
                label: t.t(
                  'storage.network.local',
                  {'n': '${usage.servedLocally}'},
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.md,
              0,
            ),
            child: AppButton(
              key: const ValueKey('storage-clear-all'),
              label: t.t('storage.clear.all'),
              variant: AppButtonVariant.secondary,
              onPressed: () => _confirmClear(context, ref, t, null),
            ),
          ),
        ],
      ),
    );
  }

  static IconData _iconOf(CacheStore s) => switch (s) {
        CacheStore.images => AppIcons.imageOutlined,
        CacheStore.chatMedia => AppIcons.photoLibraryOutlined,
        CacheStore.messages => AppIcons.chatBubbleOutlineRounded,
        CacheStore.feed => AppIcons.tableChartRounded,
        CacheStore.http => AppIcons.cloudUploadOutlined,
        CacheStore.files => AppIcons.descriptionOutlined,
        CacheStore.video => AppIcons.playCircleOutlined,
        CacheStore.other => AppIcons.folderOutlined,
      };

  static String _keepLabel(Translator t, KeepMedia keep) => switch (keep) {
        KeepMedia.threeDays => t.t('storage.keepMedia.3d'),
        KeepMedia.week => t.t('storage.keepMedia.1w'),
        KeepMedia.month => t.t('storage.keepMedia.1m'),
        KeepMedia.always => t.t('storage.keepMedia.always'),
      };

  /// [store] null = everything.
  static Future<void> _confirmClear(
    BuildContext context,
    WidgetRef ref,
    Translator t,
    CacheStore? store,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AppAlertDialog(
        title: Text(t.t('storage.clear.confirm.title')),
        content: Text(
          t.t(
            store == CacheStore.messages
                ? 'storage.clear.messages.body'
                : 'storage.clear.confirm.body',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            key: const ValueKey('storage-clear-confirm'),
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(t.t('storage.clear.row')),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final notifier = ref.read(cacheReportProvider.notifier);
    await (store == null ? notifier.clearAll() : notifier.clear(store));
    if (context.mounted) showAppSnackBar(context, t.t('storage.clear.done'));
  }

  static Future<void> _pickKeepMedia(
    BuildContext context,
    WidgetRef ref,
    Translator t,
    CacheLimits limits,
  ) async {
    final ceiling = limits.keepMediaCeilingDays;
    final choices = [
      for (final k in KeepMedia.values)
        // The administrator's ceiling: nothing longer than it (0 = any).
        if (ceiling == 0 || (k.days > 0 && k.days <= ceiling)) k,
    ];
    final picked = await showAppBottomSheet<KeepMedia>(
      context: context,
      builder: (sheet) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final k in choices)
            AppListRow(
              key: ValueKey('storage-keep-${k.name}'),
              label: _keepLabel(t, k),
              selected: k == limits.keepMedia,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop(k),
            ),
        ],
      ),
    );
    if (picked == null) return;
    await ref.read(cacheSettingsProvider.notifier).setKeepMedia(picked);
  }

  static Future<void> _pickLimit(
    BuildContext context,
    WidgetRef ref,
    Translator t,
    CacheLimits limits,
    CacheStore store,
  ) async {
    final ceiling = limits.ceilingOf(store);
    final presets = [
      for (final mb in const [50, 100, 300, 500, 1000])
        if (mb < ceiling) mb,
      ceiling,
    ];
    final current = limits.limitMb(store);
    final picked = await showAppBottomSheet<int>(
      context: context,
      builder: (sheet) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final mb in presets)
            AppListRow(
              key: ValueKey('storage-limit-${store.configKey}-$mb'),
              label: mb == ceiling
                  ? t.t('storage.limit.max', {'size': '$mb MB'})
                  : '$mb MB',
              selected: mb == current,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop(mb),
            ),
        ],
      ),
    );
    if (picked == null) return;
    await ref
        .read(cacheSettingsProvider.notifier)
        .setLimitMb(store, picked == ceiling ? null : picked);
  }
}

/// The total and a bar split by category (Telegram's ring, flat).
class _UsageHeader extends StatelessWidget {
  const _UsageHeader({required this.report, required this.t});

  final CacheReport? report;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final text = Theme.of(context).textTheme;
    final total = report?.total ?? 0;
    final palette = [
      colors.accent,
      colors.gold,
      colors.info,
      colors.success,
      colors.warning,
      colors.textSecondary,
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            report == null
                ? t.t('storage.measuring')
                : t.t('storage.used.total', {'size': byteSizeLabel(total)}),
            key: const ValueKey('storage-total'),
            style: text.titleLarge?.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.sm),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.proBadge),
            child: SizedBox(
              height: 10,
              child: Row(
                children: [
                  for (var i = 0; i < StorageScreen.categories.length; i++)
                    if (total > 0 &&
                        (report?.of(StorageScreen.categories[i]) ?? 0) > 0)
                      Expanded(
                        flex: report!.of(StorageScreen.categories[i]),
                        child: ColoredBox(color: palette[i]),
                      ),
                  if (total == 0)
                    Expanded(child: ColoredBox(color: colors.border)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NetworkRow extends StatelessWidget {
  const _NetworkRow({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      child: Text(
        label,
        style: Theme.of(context)
            .textTheme
            .bodyMedium
            ?.copyWith(color: colors.textSecondary),
      ),
    );
  }
}
