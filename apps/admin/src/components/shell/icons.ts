import {
  Article, Bank, Books, Briefcase, ClockCounterClockwise, CrownSimple, DownloadSimple, EnvelopeSimple,
  FileText, FilmStrip, Flag, Gauge, Gavel, Handshake, Key, Lifebuoy, Megaphone, Receipt, RocketLaunch,
  Scales, SealCheck, ShareNetwork, ShieldCheck, SlidersHorizontal, Ticket, ToggleRight, Translate,
  Users, UsersThree, type Icon,
} from '@phosphor-icons/react';

export const ICONS: Record<string, Icon> = {
  gauge: Gauge, users: Users, 'seal-check': SealCheck, 'users-three': UsersThree, flag: Flag, scales: Scales,
  article: Article, 'film-strip': FilmStrip, briefcase: Briefcase, gavel: Gavel, 'rocket-launch': RocketLaunch,
  'crown-simple': CrownSimple, handshake: Handshake, receipt: Receipt, ticket: Ticket, 'share-network': ShareNetwork,
  lifebuoy: Lifebuoy, megaphone: Megaphone, 'envelope-simple': EnvelopeSimple, 'toggle-right': ToggleRight, key: Key,
  'sliders-horizontal': SlidersHorizontal, books: Books, translate: Translate, 'file-text': FileText, bank: Bank,
  'download-simple': DownloadSimple, 'clock-counter-clockwise': ClockCounterClockwise, 'shield-check': ShieldCheck,
};
