import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: 'xs' | 'sm' | 'full';
}

export function Skeleton({ width = '100%', height = 14, radius = 'xs' }: SkeletonProps) {
  return <span className={`${styles.skeleton} ${styles[radius]}`} style={{ width, height }} aria-hidden="true" />;
}
