import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/case_payments/presentation/case_payment_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/consultations/domain/consultation_ics.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';

StatusTone consultationTone(ConsultationStatus s) => switch (s) {
      ConsultationStatus.pending => StatusTone.info,
      ConsultationStatus.confirmed => StatusTone.success,
      ConsultationStatus.declined => StatusTone.danger,
      ConsultationStatus.cancelled ||
      ConsultationStatus.unknown =>
        StatusTone.neutral,
    };

String consultationStatusLabel(Translator t, ConsultationStatus s) =>
    t.t('consult.status.${s.name}');

/// `Wed, Oct 21` in the viewer's language (digits localised).
String consultationDay(L10nFormats f, DateTime d) =>
    f.digits(DateFormat.MMMEd(f.locale).format(d.toLocal()));

/// `3:00 PM – 3:30 PM`, viewer's local time.
String consultationRange(L10nFormats f, Consultation c) =>
    '${f.time(c.startsAt)} – ${f.time(c.endsAt)}';

/// `Wed, Oct 21 · 3:00 PM – 3:30 PM`.
String consultationWhen(L10nFormats f, Consultation c) =>
    '${consultationDay(f, c.startsAt)} · ${consultationRange(f, c)}';

/// A call can be placed from 10 minutes before the start until the end
/// (the server's rule, re-evaluated here as the clock moves).
bool consultationCallOpen(Consultation c, DateTime now) =>
    c.status == ConsultationStatus.confirmed &&
    now.isAfter(c.startsAt.subtract(const Duration(minutes: 10))) &&
    now.isBefore(c.endsAt);

/// Rebuilds its child every [every] while mounted (the Call button
/// appears at the appointed time without a reload).
class ClockTicker extends StatefulWidget {
  const ClockTicker({
    required this.builder,
    this.every = const Duration(seconds: 20),
    super.key,
  });

  final Widget Function(BuildContext context, DateTime now) builder;
  final Duration every;

  @override
  State<ClockTicker> createState() => _ClockTickerState();
}

class _ClockTickerState extends State<ClockTicker> {
  Timer? _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(widget.every, (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _now);
}

/// The calendar file of a booking, shared as `.ics`.
Future<void> shareConsultationIcs(Translator t, Consultation c) {
  final ics = buildConsultationIcs(
    id: c.id,
    summary: t.t('consult.ics.title', {'name': c.counterpart.displayName}),
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    confirmed: c.status == ConsultationStatus.confirmed,
    description: c.note,
  );
  return shareBytes(
    Uint8List.fromList(utf8.encode(ics)),
    'lawbid-consultation.ics',
    mimeType: 'text/calendar',
  );
}

/// One booking in a list: who, when, and where it stands.
class ConsultationTile extends StatelessWidget {
  const ConsultationTile({
    required this.consultation,
    required this.t,
    required this.formats,
    required this.onTap,
    super.key,
  });

  final Consultation consultation;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = consultation;
    final who = c.counterpart.displayName;
    return Semantics(
      button: true,
      label: '$who, ${consultationWhen(formats, c)}, '
          '${consultationStatusLabel(t, c.status)}',
      excludeSemantics: true,
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          children: [
            IdentityAvatar(
              id: c.counterpart.id,
              url: c.counterpart.avatarUrl,
              initials: avatarInitials(who),
              size: 44,
              ring: false,
              trustLevel: 0,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    who,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    consultationWhen(formats, c),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ],
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
    );
  }
}
