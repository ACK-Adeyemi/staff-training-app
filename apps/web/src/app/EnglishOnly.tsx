import type { ReactNode } from 'react';
import { useLanguage } from './hooks';

/**
 * Marks English-only content (FAQs, untranslated modules, What's new) as en-GB while the interface is in another
 * language, so screen readers use the right voice. In English it adds nothing.
 */
export function EnglishOnly({
  children,
  className,
  lang = 'en-GB',
}: {
  children: ReactNode;
  className?: string;
  /** The language of the wrapped text; English unless it is a translated module. */
  lang?: string;
}) {
  const language = useLanguage();
  if (language === lang) return className ? <div className={className}>{children}</div> : <>{children}</>;
  return (
    <div lang={lang} {...(className ? { className } : {})}>
      {children}
    </div>
  );
}
