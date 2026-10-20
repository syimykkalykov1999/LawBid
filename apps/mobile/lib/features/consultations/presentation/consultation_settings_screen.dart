import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:intl/intl.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/pickers/app_pickers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';

/// Zones offered besides the phone's own (the server accepts any IANA
/// name; these cover the countries LawBid works in).
const _zones = <String>[
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Bishkek',
  'Asia/Almaty',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

const _slotChoices = [15, 20, 30, 45, 60, 90];
const _bufferChoices = [0, 5, 10, 15, 30];
const _noticeChoices = [0, 1, 2, 4, 12, 24, 48];
const _horizonChoices = [7, 14, 30, 60, 90];

/// Owner 2026-10-20 — Settings → «Консультации»: the weekly hours clients
/// can book, the length of a visit, the pause between visits, notice,
/// how far ahead, time off and the time zone.
class ConsultationSettingsScreen extends ConsumerWidget {
  const ConsultationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(consultationSettingsProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('consult.hours')),
      ),
      body: value.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CasesErrorView(
          error: e,
          t: t,
          onRetry: () => ref.invalidate(consultationSettingsProvider),
        ),
        data: (s) => _SettingsForm(initial: s),
      ),
    );
  }
}

class _SettingsForm extends ConsumerStatefulWidget {
  const _SettingsForm({required this.initial});

  final ConsultationSettings initial;

  @override
  ConsumerState<_SettingsForm> createState() => _SettingsFormState();
}

class _SettingsFormState extends ConsumerState<_SettingsForm> {
  late bool _enabled = widget.initial.enabled;
  late int _slot = widget.initial.slotMinutes;
  late int _buffer = widget.initial.bufferMinutes;
  late int _notice = widget.initial.minNoticeHours;
  late int _horizon = widget.initial.horizonDays;
  late bool _auto = widget.initial.autoConfirm;
  late String? _zone = widget.initial.timezone;
  late final List<ConsultationWindow> _windows = [...widget.initial.windows];
  late List<ConsultationTimeOff> _off = [...widget.initial.timeOff];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (_zone == null) _prefillZone();
  }

  /// The phone's zone, until the attorney picks another.
  Future<void> _prefillZone() async {
    try {
      final id = (await FlutterTimezone.getLocalTimezone()).identifier;
      if (mounted && _zone == null && id.isNotEmpty) {
        setState(() => _zone = id);
      }
    } on Object {
      // The picker below still works.
    }
  }

  String _weekday(L10nFormats f, int iso) =>
      DateFormat.EEEE(f.locale).format(DateTime(2024, 1, iso));

  String _clock(L10nFormats f, int minute) =>
      f.time(DateTime(2000, 1, 1, minute ~/ 60, minute % 60));

  Future<void> _editWindow(int weekday, {ConsultationWindow? old}) async {
    final others = [
      for (final w in _windows)
        if (w.weekday == weekday && w != old) w,
    ];
    final result = await showAppBottomSheet<_WindowResult>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WindowSheet(
        weekday: weekday,
        initial: old,
        others: others,
      ),
    );
    if (result == null) return;
    setState(() {
      if (old != null) _windows.remove(old);
      final next = result.window;
      if (next != null) _windows.add(next);
    });
  }

  Future<void> _pickZone() async {
    final picked = await showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(ctx).height * 0.7,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final z in {
                      if (_zone != null) _zone!,
                      ..._zones,
                    })
                      AppListRow(
                        label: z.replaceAll('_', ' '),
                        selected: z == _zone,
                        showChevron: false,
                        onTap: () => Navigator.of(ctx).pop(z),
                      ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked != null && mounted) setState(() => _zone = picked);
  }

  Future<void> _addOff() async {
    final now = DateTime.now();
    final start = await showAppDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (start == null || !mounted) return;
    final end = await showAppDatePicker(
      context: context,
      initialDate: start,
      firstDate: start,
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (end == null || !mounted) return;
    setState(
      () => _off = [
        ..._off,
        ConsultationTimeOff(startsOn: isoDay(start), endsOn: isoDay(end)),
      ]..sort((a, b) => a.startsOn.compareTo(b.startsOn)),
    );
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    final zone = _zone;
    if (zone == null || zone.isEmpty) {
      showAppSnackBar(context, t.t('consult.set.needZone'));
      return;
    }
    if (_enabled && _windows.isEmpty) {
      showAppSnackBar(context, t.t('consult.set.needHours'));
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(consultationsRepositoryProvider).saveSettings(
            enabled: _enabled,
            slotMinutes: _slot,
            bufferMinutes: _buffer,
            minNoticeHours: _notice,
            horizonDays: _horizon,
            autoConfirm: _auto,
            timezone: zone,
            windows: _windows,
            timeOff: _off,
          );
      ref
        ..invalidate(consultationSettingsProvider)
        ..invalidate(consultationSlotsProvider);
      if (mounted) showAppSnackBar(context, t.t('consult.set.saved'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final reason = widget.initial.notBookableReason;

    Widget section(String key) => Padding(
          padding: const EdgeInsets.only(
            top: AppSpacing.lg,
            bottom: AppSpacing.xs,
          ),
          child: Text(
            t.t(key),
            style: type.bodySmall.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        );

    Widget choices(
      List<int> values,
      int current,
      String unitKey,
      ValueChanged<int> onPick,
    ) =>
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            for (final v in {...values, current}.toList()..sort())
              AppChip(
                height: 44,
                label: t.t(unitKey, {'n': f.digits(v)}),
                selected: v == current,
                onTap: () => setState(() => onPick(v)),
              ),
          ],
        );

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _enabled,
          onChanged: (v) => setState(() => _enabled = v),
          title: Text(
            t.t('consult.set.enable'),
            style: type.body.copyWith(color: colors.text),
          ),
          subtitle: Text(
            t.t('consult.set.enableHint'),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ),
        if (widget.initial.enabled &&
            !widget.initial.bookable &&
            reason != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(
                  AppIcons.warningAmberRounded,
                  size: 18,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    t.t('consult.not.$reason'),
                    style: type.bodySmall.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
          ),
        section('consult.set.zone'),
        AppListRow(
          key: const ValueKey('consult-zone'),
          icon: AppIcons.publicRounded,
          label: _zone?.replaceAll('_', ' ') ?? t.t('consult.set.pickZone'),
          flush: true,
          onTap: _pickZone,
        ),
        section('consult.set.length'),
        choices(_slotChoices, _slot, 'consult.unit.min', (v) => _slot = v),
        section('consult.set.buffer'),
        choices(
          _bufferChoices,
          _buffer,
          'consult.unit.min',
          (v) => _buffer = v,
        ),
        section('consult.set.notice'),
        choices(_noticeChoices, _notice, 'consult.unit.h', (v) => _notice = v),
        section('consult.set.horizon'),
        choices(
          _horizonChoices,
          _horizon,
          'consult.unit.d',
          (v) => _horizon = v,
        ),
        const SizedBox(height: AppSpacing.sm),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _auto,
          onChanged: (v) => setState(() => _auto = v),
          title: Text(
            t.t('consult.set.auto'),
            style: type.body.copyWith(color: colors.text),
          ),
          subtitle: Text(
            t.t(_auto ? 'consult.set.autoOn' : 'consult.set.autoOff'),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ),
        section('consult.set.week'),
        for (var d = 1; d <= 7; d++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
            child: Row(
              children: [
                SizedBox(
                  width: 96,
                  child: Text(
                    _weekday(f, d),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(color: colors.text),
                  ),
                ),
                Expanded(
                  child: Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      for (final w in _windows
                          .where((w) => w.weekday == d)
                          .toList()
                        ..sort(
                          (a, b) => a.startMinute.compareTo(b.startMinute),
                        ))
                        AppChip(
                          key: ValueKey('consult-win-$d-${w.startMinute}'),
                          height: 44,
                          label: '${_clock(f, w.startMinute)}'
                              ' – ${_clock(f, w.endMinute)}',
                          onTap: () => _editWindow(d, old: w),
                        ),
                      AppChip(
                        key: ValueKey('consult-win-add-$d'),
                        height: 44,
                        label: '+',
                        onTap: () => _editWindow(d),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        section('consult.set.off'),
        for (final (i, o) in _off.indexed)
          Row(
            children: [
              Expanded(
                child: Text(
                  o.startsOn == o.endsOn
                      ? f.date(isoDayToDate(o.startsOn))
                      : '${f.date(isoDayToDate(o.startsOn))}'
                          ' – ${f.date(isoDayToDate(o.endsOn))}',
                  style: type.body.copyWith(color: colors.text),
                ),
              ),
              IconButton(
                tooltip: t.t('common.delete'),
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                icon: const AppIcon(AppIcons.deleteOutlineRounded),
                onPressed: () => setState(() => _off.removeAt(i)),
              ),
            ],
          ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: AppChip(
            key: const ValueKey('consult-off-add'),
            height: 44,
            label: t.t('consult.set.addOff'),
            leading: const AppIcon(AppIcons.addRounded, size: 16),
            onTap: _addOff,
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        AppButton(
          key: const ValueKey('consult-save'),
          label: t.t('consult.set.save'),
          isLoading: _busy,
          onPressed: _save,
        ),
      ],
    );
  }
}

/// What the window sheet returns: a window, or null = delete.
class _WindowResult {
  const _WindowResult(this.window);

  final ConsultationWindow? window;
}

class _WindowSheet extends ConsumerStatefulWidget {
  const _WindowSheet({
    required this.weekday,
    required this.initial,
    required this.others,
  });

  final int weekday;
  final ConsultationWindow? initial;
  final List<ConsultationWindow> others;

  @override
  ConsumerState<_WindowSheet> createState() => _WindowSheetState();
}

class _WindowSheetState extends ConsumerState<_WindowSheet> {
  late int _start = widget.initial?.startMinute ?? 9 * 60;
  late int _end = widget.initial?.endMinute ?? 17 * 60;

  Future<void> _pick({required bool start}) async {
    final m = start ? _start : _end;
    final picked = await showAppTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: (m ~/ 60) % 24, minute: m % 60),
    );
    if (picked == null || !mounted) return;
    setState(() {
      final v = picked.hour * 60 + picked.minute;
      if (start) {
        _start = v;
      } else {
        _end = v == 0 ? 1440 : v;
      }
    });
  }

  bool get _overlaps => widget.others.any(
        (w) => _start < w.endMinute && _end > w.startMinute,
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    String clock(int m) => f.time(DateTime(2000, 1, 1, (m ~/ 60) % 24, m % 60));
    final bad = _end <= _start;
    final error = bad
        ? t.t('consult.set.badRange')
        : _overlaps
            ? t.t('consult.set.overlap')
            : null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          const SizedBox(height: AppSpacing.md),
          Text(
            DateFormat.EEEE(f.locale).format(DateTime(2024, 1, widget.weekday)),
            style: type.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppListRow(
            icon: AppIcons.scheduleRounded,
            label: t.t('consult.set.from'),
            trailingText: clock(_start),
            onTap: () => _pick(start: true),
          ),
          AppListRow(
            icon: AppIcons.scheduleRounded,
            label: t.t('consult.set.to'),
            trailingText: clock(_end),
            onTap: () => _pick(start: false),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(
                error,
                style: type.bodySmall.copyWith(color: colors.dangerText),
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: t.t('consult.set.ok'),
            isEnabled: error == null,
            onPressed: () => Navigator.of(context).pop(
              _WindowResult(
                ConsultationWindow(
                  weekday: widget.weekday,
                  startMinute: _start,
                  endMinute: _end,
                ),
              ),
            ),
          ),
          if (widget.initial != null) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: t.t('common.delete'),
              variant: AppButtonVariant.secondary,
              onPressed: () =>
                  Navigator.of(context).pop(const _WindowResult(null)),
            ),
          ],
        ],
      ),
    );
  }
}
