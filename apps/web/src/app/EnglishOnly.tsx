import type { ReactNode } from 'react';
import { useLanguage } from './hooks';

/**
 * Marks English-only content (FAQs, untranslated modules, What's new) as en-GB while the interface is in another
 * language, so screen readers use the right voice. In English it adds nothing.
 */
export function EnglishOnly({ children, className }: { children: ReactNode; className?: string }) {
  const language = useLanguage();
  if (language === 'en-GB') return className ? <div className={className}>{children}</div> : <>{children}</>;
  return (
    <div lang="en-GB" {...(className ? { className } : {})}>
      {children}
    </div>
  );
}
