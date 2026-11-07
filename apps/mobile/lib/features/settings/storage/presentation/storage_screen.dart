import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/text/byte_size.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/consent_check_tile.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';
import 'package:lawbid/features/settings/storage/presentation/chat_media_screen.dart';

/// Owner 2026-10-22 (client economy plan §5.2, Telegram «Данные и
/// память»), 2026-11-03 (Telegram «Использование памяти»): what the app
/// keeps on the phone as a ring by category (video, photos, documents and
/// case files, other) with a checkbox each and one «Очистить» for the ticked
/// ones; «Автоудаление закэшированных медиа» by scope; «Максимальный размер
/// кэша» (5 / 10 / 30 GB / none; the least recently opened go first); and
/// today's network use, so the owner can see the economy packages took
/// effect. Media stays on the server: whatever is cleared is fetched again
/// when it is opened.
class StorageScreen extends ConsumerStatefulWidget {
  const StorageScreen({super.key});

  /// The rows, in the order of the ring's colours.
  static const categories = StorageCategory.values;

  @override
  ConsumerState<StorageScreen> createState() => _StorageScreenState();
}

class _StorageScreenState extends ConsumerState<StorageScreen> {
  /// Telegram starts with everything ticked.
  final Set<StorageCategory> _selected = {...StorageCategory.values};

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final report = ref.watch(cacheReportProvider).value;
    final limits = ref.watch(cacheLimitsProvider);
    final usage = ref.watch(networkUsageTodayProvider);
    final allSelected = _selected.length == StorageCategory.values.length;
    final selectedBytes = report == null
        ? 0
        : _selected.fold<int>(0, (a, c) => a + report.ofCategory(c));
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
          _UsageRing(report: report, t: t),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Column(
              children: [
                for (final c in StorageCategory.values)
                  ConsentCheckTile(
                    key: ValueKey('storage-cat-${c.name}'),
                    value: _selected.contains(c),
                    semanticLabel: t.t(_labelKey(c)),
                    onChanged: (on) => setState(
                      () => on ? _selected.add(c) : _selected.remove(c),
                    ),
                    content: Row(
                      children: [
                        _Dot(color: _paletteOf(colors, c)),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: Text(t.t(_labelKey(c)))),
                        Text(
                          report == null
                              ? t.t('storage.measuring')
                              : byteSizeLabel(report.ofCategory(c)),
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  key: const ValueKey('storage-clear-all'),
                  label: t.t(
                    allSelected
                        ? 'storage.clear.allSize'
                        : 'storage.clear.selectedSize',
                    {'size': byteSizeLabel(selectedBytes)},
                  ),
                  variant: AppButtonVariant.secondary,
                  isEnabled: _selected.isNotEmpty,
                  onPressed: () => _confirmClear(t),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  child: Text(
                    t.t('storage.clear.note'),
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
          // Owner 2026-11-02: the chat pictures by chat, once there are any.
          if ((report?.of(CacheStore.chatMedia) ?? 0) > 0)
            AppListSection(
              children: [
                AppListRow(
                  key: const ValueKey('storage-by-chat'),
                  icon: AppIcons.chatBubbleOutlineRounded,
                  label: t.t('storage.cat.chat_media'),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ChatMediaScreen(),
                    ),
                  ),
                ),
              ],
            ),
          AppListSection(
            title: t.t('storage.autoDelete.title'),
            children: [
              for (final scope in AutoDeleteScope.values)
                AppListRow(
                  key: ValueKey('storage-auto-${scope.key}'),
                  icon: _scopeIcon(scope),
                  label: t.t('storage.autoDelete.${scope.key}'),
                  trailingText: _ageLabel(t, limits.autoDelete(scope)),
                  onTap: () => _pickAge(t, limits, scope),
                ),
            ],
          ),
          _Footnote(text: t.t('storage.autoDelete.footer')),
          _CapSlider(
            capMb: limits.capMb,
            title: t.t('storage.cap.title'),
            noneLabel: t.t('storage.cap.none'),
            onChanged: (mb) =>
                ref.read(cacheSettingsProvider.notifier).setCapMb(mb),
          ),
          _Footnote(text: t.t('storage.cap.footer')),
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
        ],
      ),
    );
  }

  static String _labelKey(StorageCategory c) => switch (c) {
        StorageCategory.video => 'storage.cat.video',
        StorageCategory.photos => 'storage.cat.images',
        StorageCategory.documents => 'storage.cat.documents',
        StorageCategory.other => 'storage.cat.other',
      };

  /// Gold stays for the check mark and the active tab: the ring uses the
  /// other tokens.
  static Color _paletteOf(AppColorTokens colors, StorageCategory c) =>
      switch (c) {
        StorageCategory.video => colors.accent,
        StorageCategory.photos => colors.info,
        StorageCategory.documents => colors.success,
        StorageCategory.other => colors.textSecondary,
      };

  static IconData _scopeIcon(AutoDeleteScope s) => switch (s) {
        AutoDeleteScope.privateChats => AppIcons.chatBubbleOutlineRounded,
        AutoDeleteScope.groups => AppIcons.photoLibraryOutlined,
        AutoDeleteScope.feed => AppIcons.playCircleOutlined,
      };

  static String _ageLabel(Translator t, AutoDeleteAge age) => switch (age) {
        AutoDeleteAge.never => t.t('storage.autoDelete.never'),
        AutoDeleteAge.threeDays => t.t('storage.keepMedia.3d'),
        AutoDeleteAge.week => t.t('storage.keepMedia.1w'),
        AutoDeleteAge.month => t.t('storage.keepMedia.1m'),
      };

  Future<void> _confirmClear(Translator t) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AppAlertDialog(
        title: Text(t.t('storage.clear.confirm.title')),
        content: Text(
          t.t(
            _selected.contains(StorageCategory.other)
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
    if (ok != true || !mounted) return;
    final cleared = await ref
        .read(cacheReportProvider.notifier)
        .clearCategories({..._selected});
    if (!mounted) return;
    // Not emptied (the video proxy did not answer): say so, never «done».
    showAppSnackBar(
      context,
      t.t(cleared ? 'storage.clear.done' : 'error.default.message'),
    );
  }

  Future<void> _pickAge(
    Translator t,
    CacheLimits limits,
    AutoDeleteScope scope,
  ) async {
    final current = limits.autoDelete(scope);
    final picked = await showAppBottomSheet<AutoDeleteAge>(
      context: context,
      builder: (sheet) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final a in AutoDeleteAge.values)
            AppListRow(
              key: ValueKey('storage-auto-opt-${a.name}'),
              label: _ageLabel(t, a),
              selected: a == current,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop(a),
            ),
        ],
      ),
    );
    if (picked == null) return;
    await ref.read(cacheSettingsProvider.notifier).setAutoDelete(scope, picked);
  }
}

/// Telegram's ring: the total in the middle, one arc per category.
class _UsageRing extends StatelessWidget {
  const _UsageRing({required this.report, required this.t});

  final CacheReport? report;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final text = Theme.of(context).textTheme;
    final total = report?.total ?? 0;
    final shown = [
      for (final c in StorageCategory.values)
        if ((report?.ofCategory(c) ?? 0) > 0) c,
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
      child: SizedBox(
        height: 188,
        child: Stack(
          alignment: Alignment.center,
          children: [
            PieChart(
              PieChartData(
                startDegreeOffset: -90,
                sectionsSpace: shown.length > 1 ? 2 : 0,
                centerSpaceRadius: 70,
                pieTouchData: PieTouchData(enabled: false),
                sections: [
                  for (final c in shown)
                    PieChartSectionData(
                      value: report!.ofCategory(c).toDouble(),
                      color: _StorageScreenState._paletteOf(colors, c),
                      radius: 18,
                      showTitle: false,
                    ),
                  if (shown.isEmpty)
                    PieChartSectionData(
                      value: 1,
                      color: colors.border,
                      radius: 18,
                      showTitle: false,
                    ),
                ],
              ),
            ),
            Text(
              report == null ? t.t('storage.measuring') : byteSizeLabel(total),
              key: const ValueKey('storage-total'),
              style: text.titleLarge?.copyWith(color: colors.text),
            ),
          ],
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: const SizedBox(width: 10, height: 10),
      );
}

class _Footnote extends StatelessWidget {
  const _Footnote({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.xs,
        AppSpacing.md,
        AppSpacing.md,
      ),
      child: Text(
        text,
        style: Theme.of(context)
            .textTheme
            .bodySmall
            ?.copyWith(color: colors.textSecondary),
      ),
    );
  }
}

/// «Максимальный размер кэша»: four stops, 5 / 10 / 30 GB / none.
class _CapSlider extends StatelessWidget {
  const _CapSlider({
    required this.capMb,
    required this.title,
    required this.noneLabel,
    required this.onChanged,
  });

  final int capMb;
  final String title;
  final String noneLabel;
  final ValueChanged<int> onChanged;

  static String _label(int mb, String none) =>
      mb <= 0 ? none : '${mb ~/ 1024} GB';

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final text = Theme.of(context).textTheme;
    const stops = CacheLimits.capStopsMb;
    // A stored value that is no stop sits on the nearest one below.
    var index = stops.indexOf(capMb);
    if (index < 0) index = 1;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: text.titleSmall?.copyWith(color: colors.text)),
          Slider(
            key: const ValueKey('storage-cap-slider'),
            value: index.toDouble(),
            max: (stops.length - 1).toDouble(),
            divisions: stops.length - 1,
            activeColor: colors.accent,
            label: _label(stops[index], noneLabel),
            onChanged: (v) => onChanged(stops[v.round()]),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < stops.length; i++)
                Text(
                  _label(stops[i], noneLabel),
                  key: ValueKey('storage-cap-stop-$i'),
                  style: text.bodySmall?.copyWith(
                    color: i == index ? colors.text : colors.textSecondary,
                  ),
                ),
            ],
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
