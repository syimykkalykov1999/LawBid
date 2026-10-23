import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/platform/web_lifecycle.dart';
import 'package:lawbid/features/auth/application/qr_login_providers.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/shared/presentation/qr_code_view.dart';

/// `/auth/qr` (owner 2026-10-20, WhatsApp Web / WeChat): the website shows a
/// QR code; the signed-in phone scans it in "Scan", sees which browser asks
/// and confirms; this page then has its own session. The code lives two
/// minutes and is replaced by a fresh one by itself; a refusal on the phone
/// stops the page with a "Try again".
class WebQrLoginScreen extends ConsumerStatefulWidget {
  const WebQrLoginScreen({super.key});

  @override
  ConsumerState<WebQrLoginScreen> createState() => _WebQrLoginScreenState();
}

class _WebQrLoginScreenState extends ConsumerState<WebQrLoginScreen> {
  // Owner 2026-10-22 (package H): every 10 s as the fallback; the `/qr`
  // socket (QR_LOGIN.md) says «approved» the moment the phone answers.
  static const _pollEvery = Duration(seconds: 10);
  QrLoginSocket? _socket;
  StreamSubscription<QrLoginSocketEvent>? _socketSub;

  WebLoginCode? _code;
  WebLoginStatus _status = WebLoginStatus.pending;
  Object? _error;
  Timer? _timer;
  Stopwatch? _age;
  bool _polling = false;

  @override
  void initState() {
    super.initState();
    unawaited(_newCode());
    // Owner 2026-10-23 (web economy): no polling from a hidden tab; one
    // poll the moment the person comes back.
    _visible = WebLifecycle.events.listen((e) {
      if (e.isComingBack) unawaited(_tick());
    });
  }

  StreamSubscription<WebLifecycleEvent>? _visible;

  @override
  void dispose() {
    unawaited(_visible?.cancel());
    _timer?.cancel();
    _closeSocket();
    super.dispose();
  }

  void _closeSocket() {
    unawaited(_socketSub?.cancel());
    _socketSub = null;
    _socket?.dispose();
    _socket = null;
  }

  /// The `/qr` socket for this code: approved → poll now; rejected → the
  /// refusal; expired → a new code. A socket that never connects changes
  /// nothing — the 10-second poll carries on.
  void _listen(WebLoginCode code) {
    _closeSocket();
    final open = ref.read(qrLoginSocketFactoryProvider);
    if (open == null) return;
    try {
      final socket =
          open(ref.read(appEnvironmentProvider).apiBaseUrl, code.qrId);
      _socket = socket;
      _socketSub = socket.events.listen((e) {
        if (!mounted || _code?.qrId != code.qrId) return;
        switch (e) {
          case QrLoginSocketEvent.scanned:
            if (_status == WebLoginStatus.pending) {
              setState(() => _status = WebLoginStatus.scanned);
            }
          case QrLoginSocketEvent.approved:
            unawaited(_tick(force: true));
          case QrLoginSocketEvent.rejected:
            _timer?.cancel();
            setState(() => _status = WebLoginStatus.rejected);
          case QrLoginSocketEvent.expired:
            unawaited(_newCode());
        }
      });
    } catch (_) {
      _closeSocket();
    }
  }

  Future<void> _newCode() async {
    _timer?.cancel();
    _closeSocket();
    setState(() {
      _error = null;
      _status = WebLoginStatus.pending;
    });
    try {
      final code = await ref.read(qrLoginRepositoryProvider).createCode();
      if (!mounted) return;
      _age = Stopwatch()..start();
      setState(() => _code = code);
      _timer = Timer.periodic(_pollEvery, (_) => unawaited(_tick()));
      _listen(code);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _code = null;
        _error = e;
      });
    }
  }

  Future<void> _tick({bool force = false}) async {
    final code = _code;
    if (code == null || _polling || !mounted) return;
    // A hidden tab asks nothing (the socket may still say «approved»; its
    // `force` poll goes through).
    if (!force && !WebLifecycle.isVisible) return;
    // The code is about to expire anyway: show a fresh one before the
    // person points a phone at a dead one (not when the socket just said
    // «approved»: the tokens are waiting).
    if (!force &&
        (_age?.elapsed ?? Duration.zero) > code.expiresIn - _pollEvery) {
      unawaited(_newCode());
      return;
    }
    _polling = true;
    try {
      final status = await ref.read(qrLoginRepositoryProvider).poll(code);
      if (!mounted) return;
      switch (status) {
        case WebLoginStatus.expired:
          unawaited(_newCode());
        case WebLoginStatus.rejected:
          _timer?.cancel();
          setState(() => _status = status);
        case WebLoginStatus.approved:
          // The session exists now; the router guard leaves this page.
          _timer?.cancel();
          setState(() => _status = status);
        case WebLoginStatus.pending || WebLoginStatus.scanned:
          if (status != _status) setState(() => _status = status);
      }
    } on Object {
      // A blip: the next poll tries again.
    } finally {
      _polling = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final code = _code;
    final scanned =
        _status == WebLoginStatus.scanned || _status == WebLoginStatus.approved;
    final rejected = _status == WebLoginStatus.rejected;

    Widget qr() {
      const side = 240.0;
      if (_error != null) {
        return Column(
          children: [
            Text(
              errorText(t, _error!),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('common.retry'),
              variant: AppButtonVariant.secondary,
              onPressed: () => unawaited(_newCode()),
            ),
          ],
        );
      }
      if (code == null) {
        return const SizedBox.square(
          dimension: side,
          child: Center(child: CircularProgressIndicator()),
        );
      }
      return Stack(
        alignment: Alignment.center,
        children: [
          Opacity(
            opacity: scanned || rejected ? 0.08 : 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(AppRadii.roleCard),
                border: Border.all(color: colors.border),
              ),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: QrCodeView(
                  data: code.url,
                  size: side,
                  dotColor: AppColorsLight.accent,
                  plateColor: Colors.white,
                  semanticLabel: t.t('qr.web.title'),
                  logo: DecoratedBox(
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      child: FittedBox(
                        child: ScalesLogo(
                          size: 60,
                          strokeColor: colors.goldDark,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (scanned)
            _Overlay(
              icon: AppIcons.phoneIphone,
              text: t.t('qr.web.scanned'),
            ),
          if (rejected)
            _Overlay(
              icon: AppIcons.warningAmberRounded,
              text: t.t('qr.web.rejected'),
              action: AppButton(
                key: const ValueKey('qr-web-retry'),
                label: t.t('common.retry'),
                onPressed: () => unawaited(_newCode()),
              ),
            ),
        ],
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('qr.web.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AuthRoutes.welcome),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  qr(),
                  const SizedBox(height: AppSpacing.xl),
                  _Step(n: 1, text: t.t('qr.web.step1')),
                  _Step(n: 2, text: t.t('qr.web.step2')),
                  _Step(n: 3, text: t.t('qr.web.step3')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Overlay extends StatelessWidget {
  const _Overlay({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppIconMedallion(
          icon: icon,
          size: AppSizes.stateMedallion,
          iconSize: AppSizes.stateIcon,
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          text,
          textAlign: TextAlign.center,
          style: typography.titleMedium.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (action != null) ...[
          const SizedBox(height: AppSpacing.md),
          SizedBox(width: 200, child: action),
        ],
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.n, required this.text});

  final int n;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colors.goldTint,
              border: Border.all(color: colors.gold),
            ),
            child: SizedBox.square(
              dimension: 28,
              child: Center(
                child: Text(
                  context.digits(n),
                  style: typography.bodySmall.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              text,
              style: typography.body.copyWith(color: colors.text),
            ),
          ),
        ],
      ),
    );
  }
}
