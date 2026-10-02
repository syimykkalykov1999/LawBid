'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StickersPanel } from '@/components/media/stickers-panel';
import { VideosPanel } from '@/components/media/videos-panel';
import { Tabs } from '@/components/ui/tabs';

type Tab = 'videos' | 'stickers';

/** Reels (video assets) and sticker packs. */
export default function MediaPage() {
  const [tab, setTab] = useState<Tab>('videos');
  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Медиа"
        subtitle="Видео из рилсов и наборы стикеров. Отсюда можно снять видео, скрыть набор или собрать официальный набор стикеров."
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'videos', label: 'Видео' },
            { value: 'stickers', label: 'Стикеры' },
          ]}
        />
      </div>
      {tab === 'videos' ? <VideosPanel /> : <StickersPanel />}
    </>
  );
}
