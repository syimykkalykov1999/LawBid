import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_providers.dart';
import 'package:lawbid/features/chat/e2ee/safety_number.dart';
import 'package:lawbid/shared/presentation/qr_code_view.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Item 25 (copy of WhatsApp's «Verify security code»): the QR code with
/// the chat's 60 digits under it in 12 groups, the explanation and «Scan
/// code». Scanning the other phone's code says whether they match.
class SecurityCodeScreen extends ConsumerStatefulWidget {
  const SecurityCodeScreen({
    required this.conversationId,
    required this.otherUserId,
    required this.otherName,
    super.key,
  });

  final String conversationId;
  final String otherUserId;
  final String otherName;

  @override
  ConsumerState<SecurityCodeScreen> createState() => _SecurityCodeScreenState();
}

class _SecurityCodeScreenState extends ConsumerState<SecurityCodeScreen> {
  String? _code;
  bool _loading = true;

  /// null = not scanned yet; true / false = the scanned code matched.
  bool? _match;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final e2ee = ref.read(e2eeServiceProvider);
    String? code;
    try {
      code =
          await e2ee?.securityCode(widget.conversationId, widget.otherUserId);
    } on Object {
      code = null;
    }
    if (!mounted) return;
    setState(() {
      _code = code;
      _loading = false;
    });
  }

  Future<void> _scan() async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(builder: (_) => const _ScanCode()),
    );
    if (raw == null || !mounted) return;
    setState(() => _match = SafetyNumber.fromQr(raw) == _code);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final code = _code;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.safeBack(),
        ),
        title: Text(t.t('chat.e2ee.verifyTitle')),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : ListView(
              key: const ValueKey('e2ee-security-code'),
              padding: const EdgeInsets.all(AppSpacing.xl),
              children: [
                if (code == null)
                  Text(
                    t.t('chat.e2ee.verifyUnavailable'),
                    style: type.body.copyWith(color: colors.textSecondary),
                    textAlign: TextAlign.center,
                  )
                else ...[
                  Center(
                    child: QrCodeView(
                      data: SafetyNumber.qrPayload(code),
                      size: 220,
                      dotColor: colors.text,
                      plateColor: colors.bg,
                      semanticLabel: t.t('chat.e2ee.verifyTitle'),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  _Digits(groups: SafetyNumber.groups(code)),
                  const SizedBox(height: AppSpacing.xl),
                  if (_match != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            _match!
                                ? AppIcons.checkCircleRounded
                                : AppIcons.errorOutlineRounded,
                            color: _match! ? colors.success : colors.danger,
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Flexible(
                            child: Text(
                              t.t(
                                _match!
                                    ? 'chat.e2ee.verifyMatch'
                                    : 'chat.e2ee.verifyMismatch',
                              ),
                              style: type.body,
                            ),
                          ),
                        ],
                      ),
                    ),
                  Text(
                    t.t('chat.e2ee.verifyHint', {'name': widget.otherName}),
                    style: type.body.copyWith(color: colors.textSecondary),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  Center(
                    child: AppButton(
                      key: const ValueKey('e2ee-scan'),
                      label: t.t('chat.e2ee.verifyScan'),
                      onPressed: _scan,
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

/// The 60 digits as WhatsApp shows them: 4 rows of 3 groups of 5.
class _Digits extends StatelessWidget {
  const _Digits({required this.groups});

  final List<String> groups;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = type.titleMedium.copyWith(
      fontFeatures: const [FontFeature.tabularFigures()],
      letterSpacing: 1.5,
    );
    return Column(
      children: [
        for (var row = 0; row < groups.length; row += 3)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final g in groups.skip(row).take(3)) Text(g, style: style),
              ],
            ),
          ),
      ],
    );
  }
}

class _ScanCode extends StatefulWidget {
  const _ScanCode();

  @override
  State<_ScanCode> createState() => _ScanCodeState();
}

class _ScanCodeState extends State<_ScanCode> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _done = false;

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: MobileScanner(
          controller: _controller,
          onDetect: (capture) {
            if (_done) return;
            for (final c in capture.barcodes) {
              final raw = c.rawValue;
              if (raw != null && raw.isNotEmpty) {
                _done = true;
                Navigator.of(context).pop(raw);
                return;
              }
            }
          },
        ),
      );
}
