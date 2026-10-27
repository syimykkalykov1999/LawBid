import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/consultations_routes.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';
import 'package:lawbid/features/consultations/presentation/consultation_widgets.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';

/// Owner 2026-10-20 — a client books a consultation on an attorney's
/// profile: pick a free start, add a note (and one of their cases), send.
Future<void> showConsultationBooking(
  BuildContext context, {
  required String attorneyId,
  required String attorneyName,
}) =>
    // Owner 2026-10-22 (guest browsing): booking needs an account.
    !requireSignInFromContext(context)
        ? Future.value()
        : showAppBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            builder: (_) => _BookingSheet(
              attorneyId: attorneyId,
              attorneyName: attorneyName,
            ),
          );

/// Move an open booking to another free start. Resolves true when moved.
Future<bool> showConsultationReschedule(
  BuildContext context, {
  required Consultation consultation,
  required String attorneyId,
}) async {
  final moved = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _RescheduleSheet(
      consultation: consultation,
      attorneyId: attorneyId,
    ),
  );
  return moved ?? false;
}

/// Days strip + start chips, in the attorney's time zone, with the
/// viewer's own time under the chosen start.
class ConsultationSlotPicker extends ConsumerWidget {
  const ConsultationSlotPicker({
    required this.attorneyId,
    required this.day,
    required this.picked,
    required this.onDay,
    required this.onPick,
    super.key,
  });

  final String attorneyId;

  /// The chosen attorney-local day (`YYYY-MM-DD`); null = the first free.
  final String? day;
  final ConsultationSlot? picked;
  final ValueChanged<String> onDay;
  final ValueChanged<ConsultationSlot> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final slots = ref.watch(consultationSlotsProvider(attorneyId));
    final dayFormat = DateFormat('EEE d', f.locale);
    return slots.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => CasesErrorView(
        error: e,
        t: t,
        onRetry: () => ref.invalidate(consultationSlotsProvider(attorneyId)),
      ),
      data: (s) {
        final days = s.days;
        if (days.isEmpty) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: Text(
              t.t('consult.noSlots'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
          );
        }
        final active = day != null && days.contains(day) ? day! : days.first;
        final starts = s.on(active);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final d in days) ...[
                    AppChip(
                      key: ValueKey('consult-day-$d'),
                      height: 44,
                      label: f.digits(
                        dayFormat.format(isoDayToDate(d)),
                      ),
                      selected: d == active,
                      onTap: () => onDay(d),
                    ),
                    const SizedBox(width: AppSpacing.xs),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                for (final slot in starts)
                  AppChip(
                    key: ValueKey('consult-slot-${slot.local}'),
                    height: 44,
                    label: f.time(slot.localClock),
                    selected: picked?.startsAt == slot.startsAt,
                    onTap: () => onPick(slot),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('consult.tz.attorney', {'zone': s.timezone}),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            if (picked != null)
              Text(
                t.t('consult.tz.you', {
                  'when': '${consultationDay(f, picked!.startsAt)}'
                      ' · ${f.time(picked!.startsAt)}',
                }),
                style: type.caption.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
          ],
        );
      },
    );
  }
}

class _BookingSheet extends ConsumerStatefulWidget {
  const _BookingSheet({required this.attorneyId, required this.attorneyName});

  final String attorneyId;
  final String attorneyName;

  @override
  ConsumerState<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends ConsumerState<_BookingSheet> {
  final _note = TextEditingController();
  String? _day;
  ConsultationSlot? _slot;
  String? _caseId;
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _book() async {
    final slot = _slot;
    if (slot == null) return;
    final t = ref.read(translatorProvider);
    final auto = ref
            .read(consultationSlotsProvider(widget.attorneyId))
            .value
            ?.autoConfirm ??
        false;
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context);
    try {
      final c = await ref.read(consultationsRepositoryProvider).book(
            attorneyId: widget.attorneyId,
            startsAt: slot.startsAt,
            note: _note.text,
            caseId: _caseId,
          );
      container
        ..invalidate(consultationsListProvider)
        ..invalidate(consultationSlotsProvider);
      if (!mounted) return;
      final router = GoRouter.of(context);
      Navigator.of(context).pop();
      showAppSnackBar(
        context,
        t.t(auto ? 'consult.booked' : 'consult.requested'),
      );
      _openBooking(router, c.id);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
      // A taken start: refresh the free list.
      ref.invalidate(consultationSlotsProvider(widget.attorneyId));
      setState(() => _slot = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final slots = ref.watch(consultationSlotsProvider(widget.attorneyId)).value;
    final cases =
        ref.watch(myCasesProvider(MyCasesFilter.active)).value?.items ??
            const <CaseSummary>[];
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('consult.book.title', {'name': widget.attorneyName}),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              slots == null
                  ? t.t('consult.book.sub')
                  : t.t('consult.book.subLen', {
                      'min': '${slots.slotMinutes}',
                      'how': t.t(
                        slots.autoConfirm
                            ? 'consult.how.auto'
                            : 'consult.how.ask',
                      ),
                    }),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            ConsultationSlotPicker(
              attorneyId: widget.attorneyId,
              day: _day,
              picked: _slot,
              onDay: (d) => setState(() {
                _day = d;
                _slot = null;
              }),
              onPick: (s) => setState(() => _slot = s),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              controller: _note,
              label: t.t('consult.note'),
              maxLines: 3,
              maxLength: TextLimits.of(TextLimit.consultationNote),
              textCapitalization: TextCapitalization.sentences,
            ),
            if (cases.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t('consult.case'),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xs),
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  for (final c in cases.take(6))
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 240),
                      child: AppChip(
                        key: ValueKey('consult-case-${c.id}'),
                        height: 44,
                        label: c.title,
                        selected: _caseId == c.id,
                        onTap: () => setState(
                          () => _caseId = _caseId == c.id ? null : c.id,
                        ),
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('consult-book'),
              label: t.t(
                slots?.autoConfirm ?? false
                    ? 'consult.book.confirm'
                    : 'consult.book.send',
              ),
              icon: AppIcons.eventAvailableRounded,
              isLoading: _busy,
              isEnabled: _slot != null,
              disabledHint: t.t('consult.pickSlot'),
              onPressed: _book,
            ),
          ],
        ),
      ),
    );
  }
}

/// After the sheet closed: the new booking opens.
void _openBooking(GoRouter router, String id) {
  router.push(ConsultationsRoutes.detail(id)).ignore();
}

class _RescheduleSheet extends ConsumerStatefulWidget {
  const _RescheduleSheet({
    required this.consultation,
    required this.attorneyId,
  });

  final Consultation consultation;
  final String attorneyId;

  @override
  ConsumerState<_RescheduleSheet> createState() => _RescheduleSheetState();
}

class _RescheduleSheetState extends ConsumerState<_RescheduleSheet> {
  String? _day;
  ConsultationSlot? _slot;
  bool _busy = false;

  Future<void> _move() async {
    final slot = _slot;
    if (slot == null) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context);
    try {
      await ref
          .read(consultationsRepositoryProvider)
          .reschedule(widget.consultation.id, slot.startsAt);
      refreshConsultationsIn(container, id: widget.consultation.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showAppSnackBar(context, t.t('consult.moved'));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
      ref.invalidate(consultationSlotsProvider(widget.attorneyId));
      setState(() => _slot = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('consult.move.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('consult.move.sub'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            ConsultationSlotPicker(
              attorneyId: widget.attorneyId,
              day: _day,
              picked: _slot,
              onDay: (d) => setState(() {
                _day = d;
                _slot = null;
              }),
              onPick: (s) => setState(() => _slot = s),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('consult-move'),
              label: t.t('consult.move'),
              icon: AppIcons.eventRepeatRounded,
              isLoading: _busy,
              isEnabled: _slot != null,
              disabledHint: t.t('consult.pickSlot'),
              onPressed: _move,
            ),
          ],
        ),
      ),
    );
  }
}
