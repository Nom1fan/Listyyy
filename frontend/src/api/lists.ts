import { api, ApiError } from './client';
import type { ListResponse, ListItemResponse, AutoAddRuleResponse } from '../types';

export async function getLists(workspaceId?: string): Promise<ListResponse[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspaceId', workspaceId);
  const q = params.toString();
  return api<ListResponse[]>(`/api/lists${q ? '?' + q : ''}`);
}

export async function createList(body: {
  name: string;
  workspaceId: string;
  iconId?: string | null;
  imageUrl?: string | null;
  categoryIds?: string[];
}): Promise<ListResponse> {
  return api<ListResponse>('/api/lists', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getList(listId: string): Promise<ListResponse> {
  return api<ListResponse>(`/api/lists/${listId}`);
}

export async function updateList(
  listId: string,
  body: {
    name?: string;
    iconId?: string | null;
    imageUrl?: string | null;
    version?: number;
    categoryIds?: string[];
  }
): Promise<ListResponse> {
  return api<ListResponse>(`/api/lists/${listId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteList(listId: string): Promise<void> {
  return api<void>(`/api/lists/${listId}`, { method: 'DELETE' });
}

export async function reorderLists(listIds: string[]): Promise<void> {
  return api<void>('/api/lists/reorder', {
    method: 'PUT',
    body: JSON.stringify({ listIds }),
  });
}

export async function getListItems(listId: string): Promise<ListItemResponse[]> {
  return api<ListItemResponse[]>(`/api/lists/${listId}/items`);
}

export async function addListItem(
  listId: string,
  body: {
    productId?: string;
    categoryId?: string;
    customNameHe?: string;
    quantity?: number;
    unit?: string;
    note?: string;
    itemImageUrl?: string;
    iconId?: string;
  }
): Promise<ListItemResponse> {
  return api<ListItemResponse>(`/api/lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateListItem(
  listId: string,
  itemId: string,
  body: {
    quantity?: number;
    unit?: string;
    note?: string;
    crossedOff?: boolean;
    customNameHe?: string;
    itemImageUrl?: string | null;
    iconId?: string | null;
    categoryId?: string;
    /** When true, make the item category-less. */
    clearCategory?: boolean;
    version?: number;
  }
): Promise<ListItemResponse> {
  return api<ListItemResponse>(`/api/lists/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function removeListItem(listId: string, itemId: string): Promise<void> {
  return api<void>(`/api/lists/${listId}/items/${itemId}`, { method: 'DELETE' });
}

export async function reorderListItems(listId: string, itemIds: string[]): Promise<void> {
  return api<void>(`/api/lists/${listId}/items/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ itemIds }),
  });
}

export async function getAutoAddRule(listId: string, itemId: string): Promise<AutoAddRuleResponse | null> {
  try {
    return await api<AutoAddRuleResponse>(`/api/lists/${listId}/items/${itemId}/auto-add`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function upsertAutoAddRule(
  listId: string,
  itemId: string,
  body: {
    quantity?: number;
    everyN?: number;
    everyUnit?: string;
    enabled?: boolean;
  }
): Promise<AutoAddRuleResponse> {
  return api<AutoAddRuleResponse>(`/api/lists/${listId}/items/${itemId}/auto-add`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteAutoAddRule(listId: string, itemId: string): Promise<void> {
  return api<void>(`/api/lists/${listId}/items/${itemId}/auto-add`, { method: 'DELETE' });
}

export async function listAutoAddRules(listId: string): Promise<AutoAddRuleResponse[]> {
  return api<AutoAddRuleResponse[]>(`/api/lists/${listId}/auto-add`);
}

export async function createAutoAddRule(
  listId: string,
  body: {
    productId?: string;
    customNameHe?: string;
    categoryId?: string;
    quantity?: number;
    everyN?: number;
    everyUnit?: string;
    enabled?: boolean;
  }
): Promise<AutoAddRuleResponse> {
  return api<AutoAddRuleResponse>(`/api/lists/${listId}/auto-add`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateAutoAddRule(
  listId: string,
  ruleId: string,
  body: {
    quantity?: number;
    everyN?: number;
    everyUnit?: string;
    enabled?: boolean;
  }
): Promise<AutoAddRuleResponse> {
  return api<AutoAddRuleResponse>(`/api/lists/${listId}/auto-add/${ruleId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteAutoAddRuleById(listId: string, ruleId: string): Promise<void> {
  return api<void>(`/api/lists/${listId}/auto-add/${ruleId}`, { method: 'DELETE' });
}
