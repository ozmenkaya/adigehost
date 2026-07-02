import type { ReactNode } from 'react';
import { useReveal } from '../../hooks/useReveal';

/**
 * Çocuklarını scroll ile aşağıdan yukarı süzülerek gösterir.
 * `delay` (ms) art arda kartlarda kademeli (stagger) etki için.
 */
export default function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'header';
}) {
  const { ref, visible } = useReveal<HTMLElement>();
  return (
    <Tag
      ref={ref as never}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
