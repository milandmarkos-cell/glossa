import { getLanguage } from '../../shared/languages.ts';

interface Props {
  sentence: string;
  offset: number;
  form: string | null;
  language: string;
  className?: string;
  /** Applied to each piece after splitting (e.g. Serbian transliteration, which changes lengths). */
  transform?: (s: string) => string;
}

/** A context sentence with the word's occurrence highlighted (falls back to plain text if offsets don't line up). */
export function ContextSentence({ sentence, offset, form, language, className = '', transform = (s) => s }: Props) {
  const lang = getLanguage(language);
  const ok = form && sentence.slice(offset, offset + form.length) === form;
  return (
    <p lang={lang.locale} dir={lang.dir} className={className}>
      {ok ? (
        <>
          {transform(sentence.slice(0, offset))}
          <mark className="rounded-sm bg-[var(--mark-bg)] px-0.5 text-inherit">{transform(form!)}</mark>
          {transform(sentence.slice(offset + form!.length))}
        </>
      ) : (
        transform(sentence)
      )}
    </p>
  );
}
