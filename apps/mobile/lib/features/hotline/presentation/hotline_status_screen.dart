import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_confirm_sheet.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show stateName;
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/hotline/hotline_routes.dart';
import 'package:lawbid/features/hotline/presentation/hotline_form_screen.dart';
import 'package:lawbid/features/hotline/presentation/hotline_text.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:material_ui/material_ui.dart';

/// The client's request while it waits (mockup v4 c6–c9b): «Ищем
/// адвоката…», the queue («Все адвокаты, говорящие по-русски, заняты»),
/// «Сообщим вам», «Адвокат на линии. Позвонить сейчас?», and a request that
/// ended without a call. The call itself is our 1:1 call screen.
///
/// Live like Uber's «Finding your driver»: the socket moves it; while it
/// is open it also re-reads the request and «Сейчас на линии» every
/// `hotline.counters_interval_sec` (ETag: a 304 costs nothing), and once
/// more when the app comes back or the network returns.
class HotlineStatusScreen extends ConsumerStatefulWidget {
  const HotlineStatusScreen({super.key});

  @override
  ConsumerState<HotlineStatusScreen> createState() =>
      _HotlineStatusScreenState();
}

class _HotlineStatusScreenState extends ConsumerState<HotlineStatusScreen>
    with WidgetsBindingObserver {
  Timer? _poll;
  Timer? _tick;

  /// The saved request was looked up (until then a spinner, never «ended»).
  bool _loaded = false;

  HotlineController get _c => ref.read(hotlineControllerProvider.notifier);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(
      _c.restore().whenComplete(() {
        if (mounted) setState(() => _loaded = true);
      }),
    );
    _start();
  }

  void _start() {
    final sec = ref.read(hotlineControllerProvider).config?.countersIntervalSec;
    final every = Duration(seconds: (sec ?? 5).clamp(2, 60));
    _poll?.cancel();
    _poll = Timer.periodic(every, (_) => _pull());
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    _pull();
  }

  void _pull() {
    final f = ref.read(hotlineControllerProvider);
    if (!f.active) return;
    unawaited(_c.refresh());
    if (f.request!.status != HotlineStatus.offline) {
      unawaited(_c.refreshCounters());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _start();
    } else if (state == AppLifecycleState.paused) {
      _poll?.cancel();
      _tick?.cancel();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _leave() async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('hotline.c.queue.leaveTitle'),
      message: t.t('hotline.c.queue.leaveText'),
      confirmLabel: t.t('hotline.c.queue.leave'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _cancel();
  }

  Future<void> _cancel() async {
    await _c.cancel();
    if (mounted) context.safeBack();
  }

  Future<void> _changeLanguage() async {
    final f = ref.read(hotlineControllerProvider);
    final picked = await pickHotlineLanguages(
      context,
      ref,
      initial: f.draft?.languages ?? const [],
      max: f.config?.maxLanguages ?? 3,
    );
    if (picked != null && picked.isNotEmpty) {
      await _c.changeLanguages(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final f = ref.watch(hotlineControllerProvider);
    ref.listen<String?>(
      hotlineControllerProvider.select((s) => s.errorCode),
      (_, code) {
        final text = hotlineErrorText(t, code);
        if (text != null && code != 'NETWORK') showAppSnackBar(context, text);
      },
    );
    // The admin switched the line off (or the account is no longer a
    // client): the request is gone on the server too — the screen goes.
    ref.listen<bool>(hotlineClientVisibleProvider, (_, on) {
      if (on || !mounted) return;
      showAppSnackBar(context, t.t('hotline.c.err.off'));
      context.safeBack();
    });
    final r = f.request;
    final now = ref.read(hotlineClockProvider)();
    final notice = f.notice;
    final Widget body;
    var title = t.t('hotline.c.title');
    if (notice != null && !notice.expired(now)) {
      body = _NowView(flow: f);
    } else if (r == null && (f.busy || !_loaded)) {
      body = const Center(child: CircularProgressIndicator.adaptive());
    } else if (r == null) {
      // Nothing waits (it ended elsewhere, or a stale push was tapped).
      body = _EndedView(
        request: const HotlineRequest(id: '', status: HotlineStatus.ended),
        onAgain: () {
          _c.clearError();
          context.pushReplacement(HotlineRoutes.form);
        },
      );
    } else {
      switch (r.status) {
        case HotlineStatus.searching:
          body = _SearchingView(
            flow: f,
            onCancel: () => unawaited(_cancel()),
          );
        case HotlineStatus.queued:
          final since = f.waitingSince ?? now;
          title = t.t('hotline.c.queue.bar', {
            'time': _clock(now.difference(since)),
          });
          body = _QueueView(
            flow: f,
            onLanguage: () => unawaited(_changeLanguage()),
            onNotify: () => unawaited(_c.notifyMe()),
            onLeave: () => unawaited(_leave()),
          );
        case HotlineStatus.offline:
          body = _OfflineView(
            request: r,
            onBack: () => unawaited(_c.claim()),
            onCancel: () => unawaited(_cancel()),
          );
        case HotlineStatus.connected:
          body = _Centered(
            icon: AppIcons.callRounded,
            title: t.t('hotline.c.connecting'),
          );
        case HotlineStatus.ended || HotlineStatus.cancelled:
          body = _EndedView(
            request: r,
            onAgain: () {
              _c.clearError();
              context.pushReplacement(HotlineRoutes.form);
            },
          );
      }
    }
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(title),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.safeBack(),
        ),
      ),
      body: SafeArea(top: false, child: body),
    );
  }

  static String _clock(Duration d) {
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}

/// The scrolling content over the pinned buttons (the form's layout).
class _Frame extends StatelessWidget {
  const _Frame({required this.items, required this.buttons});

  final List<Widget> items;
  final List<Widget> buttons;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.xs,
              AppSpacing.screenSide,
              AppSpacing.screenSide,
            ),
            children: [
              for (final c in items) ...[
                c,
                const SizedBox(height: AppSpacing.md),
              ],
            ],
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            color: colors.bg,
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.md,
              AppSpacing.screenSide,
              AppSpacing.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < buttons.length; i++) ...[
                  if (i > 0) const SizedBox(height: AppSpacing.sm),
                  buttons[i],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// A red text button (the mockup's «Отменить» / «Выйти из очереди»).
class _DangerText extends StatelessWidget {
  const _DangerText({required this.label, required this.onTap, super.key});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return TextButton(
      onPressed: onTap,
      child: Text(label, style: type.button.copyWith(color: colors.dangerText)),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title(this.text, {this.center = false, super.key});

  final String text;
  final bool center;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Text(
      text,
      textAlign: center ? TextAlign.center : TextAlign.start,
      style: type.titleLarge.copyWith(color: colors.text),
    );
  }
}

class _Sub extends StatelessWidget {
  const _Sub(this.text, {this.center = false, super.key});

  final String text;
  final bool center;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Text(
      text,
      textAlign: center ? TextAlign.center : TextAlign.start,
      style: type.bodySmall.copyWith(color: colors.textSecondary),
    );
  }
}

/// The one-time disclosure (gold card) or the short line.
class _Disclosure extends ConsumerWidget {
  const _Disclosure({required this.disclosure});

  final HotlineDisclosure disclosure;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    if (!disclosure.full) {
      return _Sub(t.t('hotline.c.notice.short'), center: true);
    }
    return DecoratedBox(
      key: const ValueKey('hotline-disclosure'),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.goldLight),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.t('hotline.c.disclosure.title'),
              style: type.button.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('hotline.c.disclosure.text'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('hotline-disclosure-ok'),
              label: t.t('hotline.c.disclosure.ok'),
              variant: AppButtonVariant.secondary,
              onPressed: () => unawaited(
                ref
                    .read(hotlineControllerProvider.notifier)
                    .acknowledgeDisclosure(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// «Развод, раздел квартиры» · «Семейное право · Невада · Русский».
class _SummaryCard extends ConsumerWidget {
  const _SummaryCard({required this.draft});

  final HotlineDraft draft;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            draft.topic,
            style: type.button.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            hotlineSummary(ref, t, draft, hotlineLanguages(ref)),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// «Сейчас на линии»: language · клиентов · адвокатов (banded).
class _Counters extends ConsumerWidget {
  const _Counters({required this.flow});

  final HotlineFlow flow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final langs = hotlineLanguages(ref);
    final byKey = {for (final c in flow.counters) c.key: c};
    final codes = flow.draft?.languages ?? const <String>[];
    if (codes.isEmpty) return const SizedBox.shrink();
    final head = type.caption.copyWith(color: colors.textSecondary);
    final cell = type.bodySmall.copyWith(
      color: colors.text,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    TableRow row(List<String> cells, TextStyle style) => TableRow(
          children: [
            for (var i = 0; i < cells.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Text(
                  cells[i],
                  textAlign: i == 0 ? TextAlign.start : TextAlign.end,
                  style: style,
                ),
              ),
          ],
        );
    return AppCard(
      key: const ValueKey('hotline-counters'),
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(t.t('hotline.c.counters.title'), style: head),
          Table(
            columnWidths: const {0: FlexColumnWidth(2)},
            border: TableBorder(
              horizontalInside: BorderSide(color: colors.border),
            ),
            children: [
              row(
                [
                  t.t('hotline.c.counters.lang'),
                  t.t('hotline.c.counters.clients'),
                  t.t('hotline.c.counters.lawyers'),
                ],
                head,
              ),
              for (final code in codes)
                row(
                  [
                    hotlineLanguageName(langs, code),
                    _band(t, byKey['l:$code']?.clients),
                    _band(t, byKey['l:$code']?.lawyers, lawyers: true),
                  ],
                  cell,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A counter cell: «–» before the first numbers arrive.
String _band(Translator t, String? raw, {bool lawyers = false}) =>
    raw == null ? '–' : hotlineBand(t, raw, lawyers: lawyers);

String _speaks(WidgetRef ref, Translator t, HotlineFlow f) {
  final langs = hotlineLanguages(ref);
  return hotlineSpeaks(
    t,
    f.draft?.languages ?? const [],
    (c) => hotlineLanguageName(langs, c),
  );
}

/// c6 — «Ищем адвоката…».
class _SearchingView extends ConsumerWidget {
  const _SearchingView({required this.flow, required this.onCancel});

  final HotlineFlow flow;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final d = flow.request?.disclosure;
    return _Frame(
      items: [
        if (d != null) _Disclosure(disclosure: d),
        _Title(t.t('hotline.c.search.title'), center: true),
        _Sub(
          key: const ValueKey('hotline-search-sub'),
          t.t('hotline.c.search.sub', {'langs': _speaks(ref, t, flow)}),
          center: true,
        ),
        if (flow.draft != null) _SummaryCard(draft: flow.draft!),
        _Counters(flow: flow),
      ],
      buttons: [
        _DangerText(
          key: const ValueKey('hotline-cancel'),
          label: t.t('hotline.c.cancel'),
          onTap: onCancel,
        ),
      ],
    );
  }
}

/// c7 — everybody busy: the queue.
class _QueueView extends ConsumerWidget {
  const _QueueView({
    required this.flow,
    required this.onLanguage,
    required this.onNotify,
    required this.onLeave,
  });

  final HotlineFlow flow;
  final VoidCallback onLanguage;
  final VoidCallback onNotify;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final r = flow.request!;
    return _Frame(
      items: [
        if (r.disclosure != null) _Disclosure(disclosure: r.disclosure!),
        _Title(
          key: const ValueKey('hotline-queue-title'),
          t.t('hotline.c.queue.title', {'langs': _speaks(ref, t, flow)}),
        ),
        _Sub(
          t.t('hotline.c.queue.place', {
            'place': hotlinePlace(t, r.positionBand),
            'wait': hotlineWait(t, r.waitBand),
          }),
        ),
        _Counters(flow: flow),
      ],
      buttons: [
        AppButton(
          key: const ValueKey('hotline-change-language'),
          label: t.t('hotline.c.queue.changeLang'),
          variant: AppButtonVariant.secondary,
          height: 40,
          isEnabled: !flow.busy,
          onPressed: onLanguage,
        ),
        AppButton(
          key: const ValueKey('hotline-notify'),
          label: t.t('hotline.c.queue.notify'),
          variant: AppButtonVariant.secondary,
          height: 40,
          isEnabled: !flow.busy,
          onPressed: onNotify,
        ),
        _DangerText(
          key: const ValueKey('hotline-leave'),
          label: t.t('hotline.c.queue.leave'),
          onTap: onLeave,
        ),
      ],
    );
  }
}

/// c8 — «Напишем, когда адвокат освободится».
class _OfflineView extends ConsumerWidget {
  const _OfflineView({
    required this.request,
    required this.onBack,
    required this.onCancel,
  });

  final HotlineRequest request;
  final VoidCallback onBack;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final until = request.notifyUntil;
    return _Frame(
      items: [
        _Centered(
          icon: AppIcons.notificationsActiveOutlined,
          title: t.t('hotline.c.notify.title'),
          sub: until == null
              ? null
              : t.t('hotline.c.notify.until', {
                  'time': ref.watch(l10nFormatsProvider).dateTime(until),
                }),
        ),
      ],
      buttons: [
        AppButton(
          key: const ValueKey('hotline-back-to-queue'),
          label: t.t('hotline.c.notify.back'),
          variant: AppButtonVariant.secondary,
          height: 40,
          onPressed: onBack,
        ),
        _DangerText(
          key: const ValueKey('hotline-cancel'),
          label: t.t('hotline.c.cancel'),
          onTap: onCancel,
        ),
      ],
    );
  }
}

/// c9b — «Адвокат на линии. Позвонить сейчас?».
class _NowView extends ConsumerWidget {
  const _NowView({required this.flow});

  final HotlineFlow flow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final c = ref.read(hotlineControllerProvider.notifier);
    final d = flow.draft;
    return _Frame(
      items: [
        _Centered(
          icon: AppIcons.callRounded,
          title: t.t('hotline.c.now.title'),
          sub: d == null
              ? null
              : t.t('hotline.c.now.sub', {
                  'langs': _speaks(ref, t, flow),
                  'practice': practiceLabel(ref, d.practice),
                  'state': stateName(d.state),
                }),
        ),
      ],
      buttons: [
        AppButton(
          key: const ValueKey('hotline-call-now'),
          label: t.t('hotline.c.now.call'),
          height: 40,
          onPressed: () => unawaited(c.claim(token: flow.notice?.token)),
        ),
        AppButton(
          key: const ValueKey('hotline-not-now'),
          label: t.t('hotline.c.now.later'),
          variant: AppButtonVariant.secondary,
          height: 40,
          onPressed: c.dismissNotice,
        ),
      ],
    );
  }
}

/// A request that ended without (or after) a call: why, and «Позвонить
/// снова».
class _EndedView extends ConsumerWidget {
  const _EndedView({required this.request, required this.onAgain});

  final HotlineRequest request;
  final VoidCallback onAgain;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return _Frame(
      items: [
        _Centered(
          icon: AppIcons.callRounded,
          title: request.endReason == 'ended'
              ? t.t('hotline.c.end.done')
              : t.t('hotline.c.end.title'),
          sub: request.endReason == 'ended'
              ? null
              : hotlineEndText(t, request.endReason),
        ),
      ],
      buttons: [
        AppButton(
          key: const ValueKey('hotline-again'),
          label: t.t('hotline.c.again'),
          height: 40,
          onPressed: onAgain,
        ),
      ],
    );
  }
}

class _Centered extends StatelessWidget {
  const _Centered({required this.icon, required this.title, this.sub});

  final IconData icon;
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xxxl),
      child: Column(
        children: [
          AppIcon(icon, size: 44, color: colors.gold),
          const SizedBox(height: AppSpacing.md),
          _Title(title, center: true),
          if (sub != null) ...[
            const SizedBox(height: AppSpacing.sm),
            _Sub(sub!, center: true),
          ],
        ],
      ),
    );
  }
}
