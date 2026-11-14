import { useLocation } from 'react-router';
import { isAdminUrl, readNextUrl } from '@/lib/nextUrl';

/** True when the sign-in was started from the Django admin (?next=…/admin/…). */
export function useAdminSignIn(): boolean {
  const { search } = useLocation();
  const next = readNextUrl(search);
  return next !== null && isAdminUrl(next);
}
