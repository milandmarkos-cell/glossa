import type {
  NewTextInput, SavedKey, SaveWordsRequest, SaveWordsResult, Settings, SettingsPatch, TextDetail, TextSummary,
  TranslateItem, TranslateResponse, Word, WordPatch, WordStatus,
} from '../../shared/types.ts';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; ai: boolean; model: string | null }>('/api/health'),
  texts: (language?: string) =>
    request<TextSummary[]>(`/api/texts${language ? `?language=${encodeURIComponent(language)}` : ''}`),
  text: (id: number) => request<TextDetail>(`/api/texts/${id}`),
  createText: (input: NewTextInput) => request<TextDetail>('/api/texts', { method: 'POST', body: JSON.stringify(input) }),
  settings: () => request<Settings>('/api/settings'),
  saveSettings: (patch: SettingsPatch) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  savedKeys: (language: string) => request<SavedKey[]>(`/api/words/keys?language=${encodeURIComponent(language)}`),
  translate: (language: string, words: TranslateItem[]) =>
    request<TranslateResponse>('/api/translate', { method: 'POST', body: JSON.stringify({ language, words }) }),
  lookupWords: (language: string, keys: string[]) =>
    request<Word[]>('/api/words/lookup', { method: 'POST', body: JSON.stringify({ language, keys }) }),
  saveWords: (req: SaveWordsRequest) => request<SaveWordsResult>('/api/words/batch', { method: 'POST', body: JSON.stringify(req) }),
  words: (q: { language?: string; status?: WordStatus; q?: string; sort?: 'recent' | 'alpha' }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
    return request<Word[]>(`/api/words?${params}`);
  },
  updateWord: (id: number, patch: WordPatch) => request<Word>(`/api/words/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteWord: (id: number) => request<void>(`/api/words/${id}`, { method: 'DELETE' }),
  exportUrl: (language?: string) => `/api/words/export.csv${language ? `?language=${encodeURIComponent(language)}` : ''}`,
};
