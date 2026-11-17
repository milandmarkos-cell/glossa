import type { NewTextInput, SavedKey, Settings, SettingsPatch, TextDetail, TextSummary } from '../../shared/types.ts';

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
};
