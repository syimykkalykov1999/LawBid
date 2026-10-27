'use client';

import { useParams } from 'next/navigation';
import { PersonCard } from '@/components/staff/person-card';

export default function Page() {
  const { adminId } = useParams<{ adminId: string }>();
  return <PersonCard adminId={adminId} />;
}
