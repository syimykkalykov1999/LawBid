import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';
import 'package:lawbid/features/consultations/presentation/booking_sheet.dart';
import 'package:lawbid/features/consultations/presentation/consultation_widgets.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';

/// Owner 2026-10-20 — one booking: when, with whom, the note, and what
/// each side can do (confirm / decline / move / cancel / call / calendar).
class ConsultationDetailScreen extends ConsumerStatefulWidget {
  const ConsultationDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<ConsultationDetailScreen> createState() =>
      _ConsultationDetailScreenState();
}

class _ConsultationDetailScreenState
    extends ConsumerState<ConsultationDetailScreen> {
  bool _busy = false;

  Future<void> _run(
    Future<Consultation> Function() action, {
    String? done,
  }) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    final container = ProviderScope.containerOf(context);
    try {
      var ok = false;
      try {
        await action();
        ok = true;
      } on Object catch (e) {
        if (mounted) showAppSnackBar(context, errorText(t, e));
      }
      // Success or failure, the booking is re-read once.
      refreshConsultationsIn(container, id: widget.id);
      if (ok && mounted && done != null) showAppSnackBar(context, t.t(done));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decline(Consultation c) async {
    final reason = await _askReason(
      context,
      ref.read(translatorProvider),
      title: 'consult.decline.title',
      action: 'consult.decline',
    );
    if (reason == null) return;
    await _run(
      () => ref
          .read(consultationsRepositoryProvider)
          .decline(c.id, reason: reason),
      done: 'consult.declined',
    );
  }

  Future<void> _cancel(Consultation c) async {
    final reason = await _askReason(
      context,
      ref.read(translatorProvider),
      title: 'consult.cancel.title',
      action: 'consult.cancel',
    );
    if (reason == null) return;
    await _run(
      () => ref
          .read(consultationsRepositoryProvider)
          .cancel(c.id, reason: reason),
      done: 'consult.cancelled',
    );
  }

  Future<void> _move(Consultation c) async {
    final attorneyId =
        c.viewerIsAttorney ? ref.read(currentUserIdProvider) : c.counterpart.id;
    if (attorneyId == null) return;
    await showConsultationReschedule(
      context,
      consultation: c,
      attorneyId: attorneyId,
    );
  }

  void _call(Consultation c) {
    final conversationId = c.conversationId;
    if (conversationId == null) return;
    HapticFeedback.mediumImpact();
    ref.read(callControllerProvider.notifier).call(
          conversationId,
          peer: CallPeer(
            id: c.counterpart.id,
            isAttorney: !c.viewerIsAttorney,
            displayName: c.counterpart.displayName,
            username: c.counterpart.username,
            avatarUrl: c.counterpart.avatarUrl,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(consultationProvider(widget.id));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('consult.one')),
        actions: [
          if (value.value?.isOpen ?? false)
            IconButton(
              tooltip: t.t('consult.ics'),
              icon: const AppIcon(AppIcons.eventNoteOutlined),
              onPressed: () => shareConsultationIcs(t, value.value!),
            ),
        ],
      ),
      body: value.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CasesErrorView(
          error: e,
          t: t,
          onRetry: () => ref.invalidate(consultationProvider(widget.id)),
        ),
        data: (c) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.sheet,
          onRefresh: () async {
            ref.invalidate(consultationProvider(widget.id));
            await ref.read(consultationProvider(widget.id).future);
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.md,
              AppSpacing.screenSide,
              AppSpacing.xxl,
            ),
            children: [
              _Summary(c: c, t: t, f: f),
              const SizedBox(height: AppSpacing.lg),
              _Actions(
                c: c,
                t: t,
                busy: _busy,
                onConfirm: () => _run(
                  () => ref.read(consultationsRepositoryProvider).confirm(c.id),
                  done: 'consult.confirmed',
                ),
                onDecline: () => _decline(c),
                onMove: () => _move(c),
                onCancel: () => _cancel(c),
                onCall: () => _call(c),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<String?> _askReason(
  BuildContext context,
  Translator t, {
  required String title,
  required String action,
}) =>
    showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ReasonSheet(t: t, title: title, action: action),
    );

class _ReasonSheet extends StatefulWidget {
  const _ReasonSheet({
    required this.t,
    required this.title,
    required this.action,
  });

  final Translator t;
  final String title;
  final String action;

  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = widget.t;
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
              t.t(widget.title),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _reason,
              label: t.t('consult.reason'),
              maxLines: 3,
              maxLength: 300,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: t.t(widget.action),
              variant: AppButtonVariant.secondary,
              onPressed: () => Navigator.of(context).pop(_reason.text.trim()),
            ),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.c, required this.t, required this.f});

  final Consultation c;
  final Translator t;
  final L10nFormats f;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final who = c.counterpart.displayName;
    final username = c.counterpart.username;
    final openProfile = !c.viewerIsAttorney && username != null;
    Widget line(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon(icon, size: 18, color: colors.textSecondary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  text,
                  style: type.body.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: openProfile,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: openProfile
                  ? () => context.push(AppRoutes.lawyer(username))
                  : null,
              child: Row(
                children: [
                  IdentityAvatar(
                    id: c.counterpart.id,
                    url: c.counterpart.avatarUrl,
                    initials: avatarInitials(who),
                    size: 52,
                    ring: false,
                    trustLevel: 0,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      who,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.titleMedium.copyWith(color: colors.text),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  StatusPill(
                    label: consultationStatusLabel(t, c.status),
                    tone: consultationTone(c.status),
                  ),
                ],
              ),
            ),
          ),
          line(AppIcons.eventAvailableOutlined, consultationDay(f, c.startsAt)),
          line(AppIcons.scheduleRounded, consultationRange(f, c)),
          line(
            AppIcons.publicRounded,
            t.t('consult.tz.attorney', {'zone': c.attorneyTimezone}),
          ),
          if ((c.note ?? '').isNotEmpty)
            line(AppIcons.editNoteRounded, c.note!),
          if (c.status == ConsultationStatus.declined ||
              c.status == ConsultationStatus.cancelled)
            line(
              AppIcons.infoOutlineRounded,
              [
                t.t('consult.by.${c.cancelledBy ?? 'system'}'),
                if ((c.cancelReason ?? '').isNotEmpty) c.cancelReason!,
              ].join(' · '),
            ),
        ],
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({
    required this.c,
    required this.t,
    required this.busy,
    required this.onConfirm,
    required this.onDecline,
    required this.onMove,
    required this.onCancel,
    required this.onCall,
  });

  final Consultation c;
  final Translator t;
  final bool busy;
  final VoidCallback onConfirm;
  final VoidCallback onDecline;
  final VoidCallback onMove;
  final VoidCallback onCancel;
  final VoidCallback onCall;

  @override
  Widget build(BuildContext context) {
    return ClockTicker(
      builder: (context, now) {
        final callOpen =
            consultationCallOpen(c, now) && c.conversationId != null;
        final buttons = <Widget>[
          if (callOpen)
            AppButton(
              key: const ValueKey('consult-call'),
              label: t.t('consult.call'),
              icon: AppIcons.callRounded,
              onPressed: onCall,
            ),
          if (c.canAnswer)
            AppButton(
              key: const ValueKey('consult-confirm'),
              label: t.t('consult.confirm'),
              icon: AppIcons.checkRounded,
              isLoading: busy,
              onPressed: onConfirm,
            ),
          if (c.conversationId != null)
            AppButton(
              key: const ValueKey('consult-chat'),
              label: t.t('consult.chat'),
              icon: AppIcons.chatBubbleOutlineRounded,
              variant: AppButtonVariant.secondary,
              onPressed: () =>
                  context.push(ChatRoutes.conversation(c.conversationId!)),
            ),
          if (c.canAnswer)
            AppButton(
              key: const ValueKey('consult-decline'),
              label: t.t('consult.decline'),
              variant: AppButtonVariant.secondary,
              isEnabled: !busy,
              onPressed: onDecline,
            ),
          if (c.canChange && !c.canAnswer)
            AppButton(
              key: const ValueKey('consult-move-open'),
              label: t.t('consult.move'),
              icon: AppIcons.eventRepeatRounded,
              variant: AppButtonVariant.secondary,
              isEnabled: !busy,
              onPressed: onMove,
            ),
          if (c.canChange)
            AppButton(
              key: const ValueKey('consult-cancel'),
              label: t.t('consult.cancel'),
              variant: AppButtonVariant.secondary,
              isEnabled: !busy,
              onPressed: onCancel,
            ),
        ];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final (i, b) in buttons.indexed) ...[
              if (i > 0) const SizedBox(height: AppSpacing.sm),
              b,
            ],
          ],
        );
      },
    );
  }
}
