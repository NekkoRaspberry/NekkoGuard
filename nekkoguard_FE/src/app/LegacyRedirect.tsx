import { Navigate, useLocation } from 'react-router';

/** Old URLs keep working: redirect, keeping the query string and hash (e.g. #emails). */
export function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}
