import { getLanguage } from '../../shared/languages.ts';

/** A context sentence with the word's occurrence highlighted (falls back to plain text if offsets don't line up). */
export function ContextSentence({ sentence, offset, form, language, className = '' }: { sentence: string; offset: number; form: string | null; language: string; className?: string }) {
  const lang = getLanguage(language);
  const ok = form && sentence.slice(offset, offset + form.length) === form;
  return (
    <p lang={lang.locale} dir={lang.dir} className={className}>
      {ok ? (
        <>
          {sentence.slice(0, offset)}
          <mark className="rounded-sm bg-[var(--mark-bg)] px-0.5 text-inherit">{form}</mark>
          {sentence.slice(offset + form!.length)}
        </>
      ) : (
        sentence
      )}
    </p>
  );
}
