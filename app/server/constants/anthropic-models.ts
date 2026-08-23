export interface OfficialAnthropicModel {
  id: string;
  displayName: string;
  category: string;
  createdAt: string;
  maxTokens: number;
}

export const ANTHROPIC_OFFICIAL_MODELS: OfficialAnthropicModel[] = [
  // Claude 5 Generation
  {
    id: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    category: 'Claude 5',
    createdAt: '2026-06-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-opus-5',
    displayName: 'Claude Opus 5',
    category: 'Claude 5',
    createdAt: '2026-06-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-fable-5',
    displayName: 'Claude Fable 5',
    category: 'Claude 5',
    createdAt: '2026-05-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-mythos-5',
    displayName: 'Claude Mythos 5',
    category: 'Claude 5',
    createdAt: '2026-05-01T00:00:00Z',
    maxTokens: 16384,
  },

  // Claude 4.x Generation
  {
    id: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    category: 'Claude 4.x',
    createdAt: '2026-04-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    category: 'Claude 4.x',
    createdAt: '2026-03-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    category: 'Claude 4.x',
    createdAt: '2026-02-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    category: 'Claude 4.x',
    createdAt: '2026-02-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    category: 'Claude 4.x',
    createdAt: '2025-10-01T00:00:00Z',
    maxTokens: 8192,
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5 (Latest Alias)',
    category: 'Claude 4.x',
    createdAt: '2025-10-01T00:00:00Z',
    maxTokens: 8192,
  },
  {
    id: 'claude-opus-4-5-20251101',
    displayName: 'Claude Opus 4.5',
    category: 'Claude 4.x',
    createdAt: '2025-11-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-opus-4-5',
    displayName: 'Claude Opus 4.5 (Latest Alias)',
    category: 'Claude 4.x',
    createdAt: '2025-11-01T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    displayName: 'Claude Sonnet 4.5',
    category: 'Claude 4.x',
    createdAt: '2025-09-29T00:00:00Z',
    maxTokens: 16384,
  },
  {
    id: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5 (Latest Alias)',
    category: 'Claude 4.x',
    createdAt: '2025-09-29T00:00:00Z',
    maxTokens: 16384,
  },

  // Claude 3.7 Generation
  {
    id: 'claude-3-7-sonnet-20250219',
    displayName: 'Claude 3.7 Sonnet (Snapshot)',
    category: 'Claude 3.7',
    createdAt: '2025-02-19T00:00:00Z',
    maxTokens: 8192,
  },
  {
    id: 'claude-3-7-sonnet-latest',
    displayName: 'Claude 3.7 Sonnet (Latest Alias)',
    category: 'Claude 3.7',
    createdAt: '2025-02-19T00:00:00Z',
    maxTokens: 8192,
  },

  // Claude 3.5 Generation
  {
    id: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet v2',
    category: 'Claude 3.5',
    createdAt: '2024-10-22T00:00:00Z',
    maxTokens: 8192,
  },
  {
    id: 'claude-3-5-sonnet-20240620',
    displayName: 'Claude 3.5 Sonnet v1',
    category: 'Claude 3.5',
    createdAt: '2024-06-20T00:00:00Z',
    maxTokens: 8192,
  },
  {
    id: 'claude-3-5-sonnet-latest',
    displayName: 'Claude 3.5 Sonnet (Latest Alias)',
    category: 'Claude 3.5',
    createdAt: '2024-10-22T00:00:00Z',
    maxTokens: 8192,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    category: 'Claude 3.5',
    createdAt: '2024-10-22T00:00:00Z',
    maxTokens: 8192,
  },
  {
    id: 'claude-3-5-haiku-latest',
    displayName: 'Claude 3.5 Haiku (Latest Alias)',
    category: 'Claude 3.5',
    createdAt: '2024-10-22T00:00:00Z',
    maxTokens: 8192,
  },

  // Claude 3 Generation
  {
    id: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    category: 'Claude 3',
    createdAt: '2024-02-29T00:00:00Z',
    maxTokens: 4096,
  },
  {
    id: 'claude-3-opus-latest',
    displayName: 'Claude 3 Opus (Latest Alias)',
    category: 'Claude 3',
    createdAt: '2024-02-29T00:00:00Z',
    maxTokens: 4096,
  },
  {
    id: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    category: 'Claude 3',
    createdAt: '2024-03-07T00:00:00Z',
    maxTokens: 4096,
  },

  // Catch-all
  {
    id: '*',
    displayName: '* (Wildcard / Catch-All for Any Model)',
    category: 'Wildcard',
    createdAt: '2025-01-01T00:00:00Z',
    maxTokens: 8192,
  },
];
