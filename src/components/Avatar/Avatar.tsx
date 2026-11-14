import { initialsFor } from '@/lib/format';
import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  email: string;
  size?: 28 | 32 | 48;
}

export function Avatar({ name, email, size = 32 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initialsFor(name, email)}
    </span>
  );
}
