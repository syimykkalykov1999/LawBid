import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/qr_login_providers.dart';
import 'package:url_launcher/url_launcher.dart';

/// `/q/:id` — what the website's sign-in QR code opens (owner 2026-10-20).
///
/// - On a phone with a signed-in account (after scanning in the app, or
///   when a camera app handed the link to LawBid): "Sign in on the web?"
///   with the browser's name, its approximate address and the time, and the
///   answer.
/// - Anywhere else (the code was read by an ordinary camera and opened in a
///   browser, or the phone is signed out): a page that sends the person to
///   the app. Public — no account needed to see it.
class WebLoginLinkScreen extends ConsumerWidget {
  const WebLoginLinkScreen({required this.qrId, super.key});

  final String qrId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(sessionControllerProvider) != null;
    return !kIsWeb && signedIn
        ? _ConfirmView(qrId: qrId)
        : _OpenInAppView(qrId: qrId);
  }
}

/// The frame both views share: a back arrow, centred content.
class _Frame extends ConsumerWidget {
  const _Frame({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(title),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.canPop()
              ? context.pop()
              : context.go(
                  ref.read(sessionControllerProvider) == null
                      ? '/welcome'
                      : AppRoutes.feed,
                ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

class _OpenInAppView extends ConsumerWidget {
  const _OpenInAppView({required this.qrId});

  final String qrId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return _Frame(
      title: t.t('qr.login.title'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppIconMedallion(
            icon: AppIcons.qrCode,
            size: AppSizes.stateMedallion,
            iconSize: AppSizes.stateIcon,
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            t.t('qr.link.body'),
            textAlign: TextAlign.center,
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xl),
          AppButton(
            key: const ValueKey('qr-open-app'),
            label: t.t('qr.link.open'),
            onPressed: () => unawaited(
              launchUrl(
                Uri(scheme: 'lawbid', host: 'q', path: '/$qrId'),
                mode: LaunchMode.externalApplication,
              ).catchError((_) => false),
            ),
          ),
        ],
      ),
    );
  }
}

enum _Phase { loading, ready, working, done, expired, failed }

class _ConfirmView extends ConsumerStatefulWidget {
  const _ConfirmView({required this.qrId});

  final String qrId;

  @override
  ConsumerState<_ConfirmView> createState() => _ConfirmViewState();
}

class _ConfirmViewState extends ConsumerState<_ConfirmView> {
  _Phase _phase = _Phase.loading;
  late WebLoginPreview _preview;
  Object? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() => _phase = _Phase.loading);
    try {
      final p = await ref.read(qrLoginRepositoryProvider).preview(widget.qrId);
      if (!mounted) return;
      setState(() {
        _preview = p;
        _phase = _Phase.ready;
      });
    } on Object catch (e) {
      _fail(e);
    }
  }

  void _fail(Object e) {
    if (!mounted) return;
    setState(() {
      _error = e;
      _phase = e is ApiException && e.code == ApiErrorCodes.notFound
          ? _Phase.expired
          : _Phase.failed;
    });
  }

  Future<void> _answer({required bool approve}) async {
    setState(() => _phase = _Phase.working);
    try {
      await ref
          .read(qrLoginRepositoryProvider)
          .answer(widget.qrId, approve: approve);
      if (!mounted) return;
      if (approve) {
        setState(() => _phase = _Phase.done);
      } else {
        _leave();
      }
    } on Object catch (e) {
      _fail(e);
    }
  }

  void _leave() =>
      context.canPop() ? context.pop() : context.go(AppRoutes.feed);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);

    Widget medallion(IconData icon, [AppMedallionTone? tone]) =>
        AppIconMedallion(
          icon: icon,
          tone: tone ?? AppMedallionTone.gold,
          size: AppSizes.stateMedallion,
          iconSize: AppSizes.stateIcon,
        );

    final body = switch (_phase) {
      _Phase.loading || _Phase.working => const Padding(
          padding: EdgeInsets.all(AppSpacing.xxl),
          child: Center(child: CircularProgressIndicator()),
        ),
      _Phase.done => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            medallion(AppIcons.check, AppMedallionTone.success),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('qr.login.done'),
              textAlign: TextAlign.center,
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppButton(label: t.t('common.done'), onPressed: _leave),
          ],
        ),
      _Phase.expired || _Phase.failed => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            medallion(AppIcons.warningAmberRounded, AppMedallionTone.danger),
            const SizedBox(height: AppSpacing.lg),
            Text(
              _phase == _Phase.expired
                  ? t.t('qr.login.expired')
                  : errorText(t, _error ?? ''),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.xl),
            if (_phase == _Phase.failed)
              AppButton(label: t.t('common.retry'), onPressed: _load)
            else
              AppButton(label: t.t('common.close'), onPressed: _leave),
          ],
        ),
      _Phase.ready => _Question(
          t: t,
          preview: _preview,
          onApprove: () => unawaited(_answer(approve: true)),
          onCancel: () => unawaited(_answer(approve: false)),
        ),
    };
    return _Frame(title: t.t('qr.login.title'), child: body);
  }
}

class _Question extends StatelessWidget {
  const _Question({
    required this.t,
    required this.preview,
    required this.onApprove,
    required this.onCancel,
  });

  final Translator t;
  final WebLoginPreview preview;
  final VoidCallback onApprove;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = (preview.deviceName ?? '').trim();
    final local = preview.createdAt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    final when = '${two(local.hour)}:${two(local.minute)}';
    final details = [
      if (preview.ipHint != null) preview.ipHint!,
      when,
    ].join(' · ');
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const AppIconMedallion(
          icon: AppIcons.computer,
          size: AppSizes.stateMedallion,
          iconSize: AppSizes.stateIcon,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
          elevated: true,
          child: SizedBox(
            width: double.infinity,
            child: Column(
              children: [
                Text(
                  t.t('qr.login.browser'),
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  name.isEmpty ? 'Web' : name,
                  textAlign: TextAlign.center,
                  style: typography.titleMedium.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  details,
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          t.t('qr.login.body'),
          textAlign: TextAlign.center,
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('qr.login.warn'),
          key: const ValueKey('qr-login-warn'),
          textAlign: TextAlign.center,
          style: typography.bodySmall.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.xl),
        AppButton(
          key: const ValueKey('qr-login-approve'),
          label: t.t('qr.login.approve'),
          onPressed: onApprove,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          key: const ValueKey('qr-login-cancel'),
          label: t.t('common.cancel'),
          variant: AppButtonVariant.secondary,
          onPressed: onCancel,
        ),
      ],
    );
  }
}
