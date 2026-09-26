import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getList,
  getListItems,
  addListItem,
  updateListItem,
  updateList,
  removeListItem,
  deleteList,
  reorderListItems,
  listAutoAddRules,
} from '../api/lists';
import { getCategories, getProducts } from '../api/products';
import { useListEvents } from '../hooks/useListEvents';
import { useWorkspaceEvents } from '../hooks/useWorkspaceEvents';
import { AppBar } from '../components/AppBar';
import { CategoryAttachPicker } from '../components/CategoryAttachPicker';
import { CategoryIcon } from '../components/CategoryIcon';
import { PlaintextListDialog } from '../components/PlaintextListDialog';
import { ProductBankView } from '../components/ProductBankView';
import { ViewModeToggle, useViewMode } from '../components/ViewModeToggle';
import { getFilteredProducts } from '../utils/categoryFilter';
import type { ListItemResponse, ListEvent, WorkspaceEvent, ProductDto, AutoAddRuleResponse } from '../types';
import { formatRuleSummary, formatNextRun, findRuleForItem } from '../utils/autoAdd';

/** Returns the string to show for quantity+unit, or null to hide. Shows "1 יחידה" when item.showQuantityUnit. */
function formatQuantityUnit(item: ListItemResponse): string | null {
  if (item.showQuantityUnit) return `${item.quantity} ${item.unit}`;
  const q = Number(item.quantity);
  const u = (item.unit ?? '').trim();
  if (q === 1 && (u === '' || u === 'יחידה')) return null;
  return `${item.quantity} ${item.unit}`;
}

function TrashIcon({ size = 18, color = '#999' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z" fill={color} />
      <path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Z" fill={color} />
      <path d="M5 8h14l-1.2 13a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" fill={color} />
      <rect x="9.5" y="11" width="1.2" height="8" rx="0.6" fill="#fff" />
      <rect x="11.4" y="11" width="1.2" height="8" rx="0.6" fill="#fff" />
      <rect x="13.3" y="11" width="1.2" height="8" rx="0.6" fill="#fff" />
    </svg>
  );
}

function EyeIcon({ size = 18, color = '#666' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 18, color = '#666' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function SearchIcon({ size = 18, color = '#999' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PencilIcon({ size = 18, color = '#666' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

/** Clock indicator for items with an automatic replenishment rule (indication only, not a button). */
function ClockIcon({ size = 18, color = '#2e7d32' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/** Delay before the auto-add tooltip appears (much snappier than the native `title` tooltip). */
const AUTO_ADD_TOOLTIP_DELAY_MS = 250;

/** Green clock badge marking an auto-add rule; hover shows the rule definition. */
function AutoAddBadge({ rule, size = 18 }: { rule: AutoAddRuleResponse | undefined; size?: number }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const showTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
  }, []);

  if (!rule) return null;
  const tip = rule.enabled
    ? `הוספה אוטומטית: ${formatRuleSummary(rule)}${rule.nextRunAt ? ` · הבאה: ${formatNextRun(rule.nextRunAt)}` : ''}`
    : `הוספה אוטומטית מושהית: ${formatRuleSummary(rule)}`;

  function handleMouseEnter() {
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => setTooltipVisible(true), AUTO_ADD_TOOLTIP_DELAY_MS);
  }

  function handleMouseLeave() {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setTooltipVisible(false);
  }

  return (
    <span
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={tip}
      data-testid="auto-add-badge"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0, lineHeight: 1 }}
    >
      <ClockIcon size={size} />
      {tooltipVisible && (
        <span
          role="tooltip"
          data-testid="auto-add-tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#333',
            color: '#fff',
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 8,
            maxWidth: 220,
            textAlign: 'center',
            lineHeight: 1.5,
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}

/** Expand-all: chevrons down – expand all sections */
function ExpandAllIcon({ size = 20, color = '#555' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10l5 5 5-5M7 4l5 5 5-5" />
    </svg>
  );
}

/** Collapse-all: chevrons up – collapse all sections */
function CollapseAllIcon({ size = 20, color = '#555' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 14l5-5 5 5M7 20l5-5 5 5" />
    </svg>
  );
}

/** Chevron down – category expanded */
function ChevronDownIcon({ size = 20, color = '#555' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Chevron right – category collapsed */
function ChevronRightIcon({ size = 20, color = '#555' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SortableItem({ id, children }: {
  id: string;
  children: (props: { handleProps: React.HTMLAttributes<HTMLElement> }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children({ handleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

function getImageUrl(url: string | null): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = import.meta.env.VITE_API_BASE || '';
  return base + url;
}

type ListDetailLocationState = { highlightCategoryId?: string; highlightItemId?: string } | null;

export function ListDetail() {
  const { listId } = useParams<{ listId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const locationState = location.state as ListDetailLocationState;

  if (!listId) {
    return <Navigate to="/lists" replace />;
  }
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationIsError, setNotificationIsError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteMarked, setConfirmDeleteMarked] = useState(false);
  const [viewMode, setViewMode] = useViewMode(`list-${listId}`);
  const [hideCrossedOff, setHideCrossedOff] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSuggestion, setShowAddSuggestion] = useState(false);
  const [listDetailMenuOpen, setListDetailMenuOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [highlightedCategoryName, setHighlightedCategoryName] = useState<string | null>(null);
  const [attachCategoriesOpen, setAttachCategoriesOpen] = useState(false);
  const [attachCategoriesDraft, setAttachCategoriesDraft] = useState<string[]>([]);
  const [productBankSheetOpen, setProductBankSheetOpen] = useState(false);
  const [plaintextDialogOpen, setPlaintextDialogOpen] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});

  const { data: list } = useQuery({
    queryKey: ['list', listId],
    queryFn: () => getList(listId),
    enabled: !!listId,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['listItems', listId],
    queryFn: () => getListItems(listId),
    enabled: !!listId,
  });

  const { data: workspaceCategories = [] } = useQuery({
    queryKey: ['categories', list?.workspaceId],
    queryFn: () => getCategories(list!.workspaceId),
    enabled: !!list?.workspaceId,
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts(),
    enabled: !!list?.workspaceId,
  });

  const { data: autoAddRulesData } = useQuery({
    queryKey: ['autoAddRules', listId],
    queryFn: () => listAutoAddRules(listId),
    enabled: !!listId,
  });
  const autoAddRules = Array.isArray(autoAddRulesData) ? autoAddRulesData : [];

  const filteredProducts = getFilteredProducts(allProducts, list);
  const hasCrossedOff = items.some(i => i.crossedOff);

  function showNotification(msg: string, isError = false) {
    setNotification(msg);
    setNotificationIsError(isError);
    setTimeout(() => setNotification(null), isError ? 5000 : 4000);
  }

  useListEvents(listId ?? null, useCallback((event: ListEvent) => {
    queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
    // A changed item can change badge matching (added/renamed/removed), so refresh rules together.
    queryClient.invalidateQueries({ queryKey: ['autoAddRules', listId] });
    const who = event.userDisplayName || 'מישהו';
    const what = event.itemDisplayName + ' ' + event.quantityUnit;
    if (event.type === 'ADDED') showNotification(`${who} הוסיף: ${what}`);
    if (event.type === 'REMOVED') showNotification(`${who} הסיר: ${what}`);
    if (event.type === 'UPDATED') showNotification(`${who} עדכן: ${what}`);
  }, [listId, queryClient]));

  useWorkspaceEvents(list?.workspaceId ?? null, useCallback((event: WorkspaceEvent) => {
    if (event.entityType === 'LIST') {
      queryClient.invalidateQueries({ queryKey: ['list', listId] });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
    }
    if (event.entityType === 'CATEGORY') {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      queryClient.invalidateQueries({ queryKey: ['autoAddRules', listId] });
    }
    if (event.entityType === 'PRODUCT') {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      queryClient.invalidateQueries({ queryKey: ['autoAddRules', listId] });
    }
  }, [listId, queryClient]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const reorderMutation = useMutation({
    mutationFn: (itemIds: string[]) => reorderListItems(listId, itemIds),
    onError: () => queryClient.invalidateQueries({ queryKey: ['listItems', listId] }),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const checkedItemsNow = filteredItems.filter((i) => i.crossedOff);

    // Reorder within checked section
    if (checkedItemsNow.some((i) => i.id === active.id) && checkedItemsNow.some((i) => i.id === over.id)) {
      const oldIndex = checkedItemsNow.findIndex((i) => i.id === active.id);
      const newIndex = checkedItemsNow.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reorderedChecked = arrayMove(checkedItemsNow, oldIndex, newIndex);
      const uncheckedOrder = categories.flatMap((cat) => grouped[cat].filter((i) => !i.crossedOff));
      const newItems = [...uncheckedOrder, ...reorderedChecked];
      queryClient.setQueryData(['listItems', listId], newItems);
      reorderMutation.mutate(newItems.map((i) => i.id));
      return;
    }

    // Find which category the dragged item is in
    let targetCat = '';
    for (const cat of categories) {
      if (grouped[cat].some((i) => i.id === active.id)) {
        targetCat = cat;
        break;
      }
    }

    const catUnchecked = grouped[targetCat].filter((i) => !i.crossedOff);
    const oldIndex = catUnchecked.findIndex((i) => i.id === active.id);
    const newIndex = catUnchecked.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedCatUnchecked = arrayMove(catUnchecked, oldIndex, newIndex);

    // Build full item order: unchecked by category, then checked
    const uncheckedOrder = categories.flatMap((cat) =>
      cat === targetCat ? reorderedCatUnchecked : grouped[cat].filter((i) => !i.crossedOff)
    );
    const checkedOrder = filteredItems.filter((i) => i.crossedOff);
    const newItems = [...uncheckedOrder, ...checkedOrder];

    // Optimistic update
    queryClient.setQueryData(['listItems', listId], newItems);

    // Persist to server
    reorderMutation.mutate(newItems.map((i) => i.id));
  }

  const updateMutation = useMutation({
    mutationFn: ({
      itemId,
      body,
    }: {
      itemId: string;
      body: { crossedOff?: boolean; quantity?: number; unit?: string; note?: string; itemImageUrl?: string | null; iconId?: string | null; categoryId?: string; clearCategory?: boolean; version?: number };
    }) => updateListItem(listId, itemId, body),
    onMutate: async ({ itemId, body }) => {
      await queryClient.cancelQueries({ queryKey: ['listItems', listId] });
      const previous = queryClient.getQueryData<ListItemResponse[]>(['listItems', listId]);
      queryClient.setQueryData<ListItemResponse[]>(['listItems', listId], (old) =>
        old?.map((item) => (item.id === itemId ? { ...item, ...body } : item))
      );
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['listItems', listId], context.previous);
      }
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      showNotification(err.message || 'שגיאה בעדכון הפריט', true);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removeListItem(listId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listItems', listId] }),
  });

  const addItemMutation = useMutation({
    mutationFn: (body: Parameters<typeof addListItem>[1]) => addListItem(listId, body),
    onSuccess: (newItem: ListItemResponse) => {
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (newItem.categoryNameHe) {
        setCollapsedCategories((prev) => {
          const next = new Set(prev);
          next.delete(newItem.categoryNameHe!);
          return next;
        });
      }
      setHighlightedItemId(newItem.id);
    },
    onError: (err: Error) => {
      showNotification(err.message || 'שגיאה בהוספת הפריט', true);
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      navigate('/lists');
    },
  });

  const attachCategoriesMutation = useMutation({
    mutationFn: (categoryIds: string[]) =>
      updateList(listId, { categoryIds, version: list?.version }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list', listId] });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      setAttachCategoriesOpen(false);
    },
    onError: (err: Error) => {
      showNotification(err.message || 'שגיאה בעדכון הקטגוריות', true);
    },
  });

  function openAttachCategoriesDialog() {
    setAttachCategoriesDraft(list?.categoryIds ?? []);
    setAttachCategoriesOpen(true);
  }

  const deleteMarkedMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      await Promise.all(itemIds.map((itemId) => removeListItem(listId, itemId)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      setConfirmDeleteMarked(false);
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      showNotification(err.message || 'שגיאה במחיקת פריטים', true);
    },
  });

  const filteredItems = searchQuery.trim()
    ? items.filter(i => {
        const q = searchQuery.trim().toLowerCase();
        return i.displayName.toLowerCase().includes(q)
          || (i.note && i.note.toLowerCase().includes(q));
      })
    : items;

  const hasExactMatch = searchQuery.trim()
    ? items.some(i => i.displayName.toLowerCase() === searchQuery.trim().toLowerCase())
    : true;

  useEffect(() => {
    if (!searchQuery.trim() || hasExactMatch) {
      setShowAddSuggestion(false);
      return;
    }
    const timer = setTimeout(() => setShowAddSuggestion(true), 500);
    return () => clearTimeout(timer);
  }, [searchQuery, hasExactMatch]);

  useEffect(() => {
    if (!highlightedItemId) return;
    const el = itemRefs.current[highlightedItemId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const t = setTimeout(() => setHighlightedItemId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightedItemId, items]);

  useEffect(() => {
    if (!highlightedCategoryName) return;
    const el = categoryRefs.current[highlightedCategoryName];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const t = setTimeout(() => setHighlightedCategoryName(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightedCategoryName, filteredItems]);

  // When returning from ListItemEdit after moving an item to another category, scroll to and highlight that category/item
  useEffect(() => {
    const categoryId = locationState?.highlightCategoryId;
    const itemId = locationState?.highlightItemId;
    if (categoryId === undefined && !itemId) return;
    if (categoryId && workspaceCategories.length === 0) return;
    const categoryName = categoryId
      ? (workspaceCategories.find((c) => c.id === categoryId)?.nameHe ?? 'אחר')
      : 'אחר';
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.delete(categoryName);
      return next;
    });
    setHighlightedCategoryName(categoryName);
    if (itemId) setHighlightedItemId(itemId);
  }, [locationState?.highlightCategoryId, locationState?.highlightItemId, workspaceCategories]);

  const listItemMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    const out: ListItemResponse[] = [];
    for (const i of items) {
      if (
        i.displayName.toLowerCase().includes(q) ||
        (i.note && i.note.toLowerCase().includes(q))
      ) {
        out.push(i);
        if (out.length >= 5) break;
      }
    }
    return out;
  }, [searchQuery, items]);

  const productMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    const out: ProductDto[] = [];
    for (const p of filteredProducts) {
      if (!p.nameHe.toLowerCase().includes(q)) continue;
      const alreadyInList =
        items.some((i) => i.productId === p.id) ||
        items.some((i) => i.displayName.toLowerCase() === p.nameHe.toLowerCase());
      if (alreadyInList) continue;
      out.push(p);
      if (out.length >= 7) break;
    }
    return out;
  }, [searchQuery, filteredProducts, items]);

  function handleAddFromSearch() {
    const name = searchQuery.trim();
    if (!name) return;
    setSearchQuery('');
    setShowAddSuggestion(false);
    addItemMutation.mutate({
      customNameHe: name,
      quantity: 1,
      unit: 'יחידה',
    });
  }

  function handleAddProduct(p: ProductDto) {
    setSearchQuery('');
    setShowAddSuggestion(false);
    addItemMutation.mutate({
      productId: p.id,
      quantity: 1,
      unit: p.defaultUnit || 'יחידה',
      categoryId: p.categoryId || undefined,
      iconId: p.iconId || undefined,
    });
  }

  const showAddSearchDropdown = searchQuery.trim() && (listItemMatches.length > 0 || productMatches.length > 0 || showAddSuggestion);
  const addSearchDropdown = showAddSearchDropdown ? (
    <div
      role="listbox"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 4,
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
        border: '1px solid #e0e0e0',
        zIndex: 10,
        overflow: 'hidden',
      }}
    >
      {listItemMatches.length > 0 && (
        <>
          <div style={{ padding: '6px 14px', fontSize: 12, color: '#666', fontWeight: 600, background: '#f8f8f8', borderBottom: '1px solid #eee' }}>
            כבר ברשימה
          </div>
          {listItemMatches.map((item) => (
            <div
              key={item.id}
              role="option"
              aria-selected={false}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 15,
                color: '#888',
                textAlign: 'right',
                background: '#fafafa',
              }}
            >
              <CategoryIcon
                iconId={item.iconId ?? item.categoryIconId ?? null}
                imageUrl={item.itemImageUrl ?? item.productImageUrl ?? null}
                size={24}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{item.displayName}</div>
                {item.categoryNameHe && <div style={{ fontSize: 12, color: '#aaa' }}>{item.categoryNameHe}</div>}
              </div>
              <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>כבר ברשימה</span>
            </div>
          ))}
        </>
      )}
      {productMatches.map((p) => (
        <button
          key={p.id}
          type="button"
          role="option"
          onMouseDown={(e) => { e.preventDefault(); handleAddProduct(p); }}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid #f0f0f0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 15,
            color: '#333',
            textAlign: 'right',
          }}
        >
          <CategoryIcon iconId={p.iconId ?? p.categoryIconId} imageUrl={p.imageUrl} size={24} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{p.nameHe}</div>
            {p.categoryNameHe && <div style={{ fontSize: 12, color: '#888' }}>{p.categoryNameHe}</div>}
          </div>
        </button>
      ))}
      {showAddSuggestion && (
        <button
          type="button"
          role="option"
          onMouseDown={(e) => { e.preventDefault(); handleAddFromSearch(); }}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 15,
            color: 'var(--color-primary-dark)',
            fontWeight: 500,
            textAlign: 'right',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          <span>הוסף &quot;{searchQuery.trim()}&quot; לרשימה</span>
        </button>
      )}
    </div>
  ) : null;

  const grouped = filteredItems.reduce<Record<string, ListItemResponse[]>>((acc, item) => {
    const key = item.categoryNameHe || 'אחר';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort((a, b) => (a === 'אחר' ? 1 : b === 'אחר' ? -1 : a.localeCompare(b)));

  /** Checked (crossed-off) items, shown in a separate section below. Order preserved from filteredItems. */
  const checkedItems = useMemo(() => filteredItems.filter((i) => i.crossedOff), [filteredItems]);
  const plaintextItems = [
    ...categories.flatMap((cat) => grouped[cat].filter((i) => !i.crossedOff)),
    ...checkedItems,
  ];

  const CHECKED_SECTION = '__checked__';

  function getCategoryIconId(cat: string): string | null {
    const first = grouped[cat]?.[0];
    return first ? first.categoryIconId ?? null : null;
  }

  function getCategoryImageUrl(cat: string): string | null {
    const first = grouped[cat]?.[0];
    if (!first?.categoryId) return null;
    const category = workspaceCategories.find((c) => c.id === first.categoryId);
    return category?.imageUrl ?? null;
  }

  return (
    <>
      <AppBar
        title={list?.name || 'רשימה'}
        titleRight={list ? <CategoryIcon iconId={list.iconId} imageUrl={list.imageUrl} size={28} /> : null}
        backTo="/lists"
        right={
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setListDetailMenuOpen((v) => !v)}
              aria-label="תפריט רשימה"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 22,
                padding: '4px 8px',
                lineHeight: 1,
                color: '#fff',
                borderRadius: 6,
              }}
            >
              &#8942;
            </button>
            {listDetailMenuOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                  onClick={() => setListDetailMenuOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    background: '#fff',
                    borderRadius: 10,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    minWidth: 140,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setListDetailMenuOpen(false); navigate(`/lists/${listId}/edit`); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: '100%', padding: '10px 16px', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', borderBottom: '1px solid #f0f0f0', color: '#333' }}
                  >
                    ערוך
                    <PencilIcon size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setListDetailMenuOpen(false); setConfirmDelete(true); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: '100%', padding: '10px 16px', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#c00' }}
                  >
                    מחק
                    <TrashIcon size={16} color="#c00" />
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />
      <main style={{ padding: 16 }}>
        {notification && (
          <div
            onClick={() => setNotification(null)}
            style={{
              position: 'fixed',
              bottom: 'max(24px, env(safe-area-inset-bottom))',
              left: 16,
              right: 16,
              padding: '14px 40px 14px 14px',
              background: notificationIsError
                ? 'linear-gradient(135deg, #c62828 0%, #b71c1c 100%)'
                : '#333',
              color: '#fff',
              borderRadius: 12,
              textAlign: 'center',
              zIndex: 1100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {notification}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setNotification(null); }}
              aria-label="סגור"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: 40,
                background: 'none',
                border: 'none',
                color: '#fff',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {!isLoading && (
          <>
            <div style={{ position: 'relative', marginBottom: 12, display: 'flex', alignItems: 'stretch', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                  <SearchIcon size={18} color="#999" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={() => setTimeout(() => setShowAddSuggestion(false), 150)}
                  placeholder="הוסף / חפש פריט"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 36px',
                    borderRadius: 10,
                    border: '1px solid #ddd',
                    fontSize: 15,
                    background: '#f8f8f8',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setShowAddSuggestion(false); }}
                    aria-label="נקה"
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      fontSize: 16,
                      color: '#999',
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {list && list.categoryIds.length >= 1 && (
                <button
                  type="button"
                  onClick={() => setProductBankSheetOpen(true)}
                  aria-label="הוסף מקטגוריות"
                  data-testid="add-from-categories-button"
                  style={{
                    flexShrink: 0,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: '1px solid var(--color-primary)',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  + מקטגוריות
                </button>
              )}
              {addSearchDropdown}
            </div>
            {items.length === 0 && !searchQuery.trim() && (
              <div style={{ margin: '8px 0 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#999', margin: 0 }}>
                  הרשימה ריקה — הוסיפו פריטים או חפשו
                </p>
                {list && list.categoryIds.length === 0 && (
                  <button
                    type="button"
                    onClick={openAttachCategoriesDialog}
                    data-testid="empty-state-attach-categories"
                    style={{
                      marginTop: 6,
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: 14,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                  >
                    צרפו קטגוריות לרשימה זו לאוטו-השלמה והוספה מהמאגר
                  </button>
                )}
              </div>
            )}
            {items.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setPlaintextDialogOpen(true)}
                style={{
                  padding: '6px 10px',
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  color: '#333',
                }}
              >
                הצג כטקסט
              </button>
              {hasCrossedOff && (
                <>
                  <button
                    type="button"
                    onClick={() => setHideCrossedOff(v => !v)}
                    title={hideCrossedOff ? 'הצג פריטים מסומנים' : 'הסתר פריטים מסומנים'}
                    aria-label={hideCrossedOff ? 'הצג פריטים מסומנים' : 'הסתר פריטים מסומנים'}
                    style={{
                      padding: '6px 8px',
                      background: hideCrossedOff ? 'var(--color-primary)' : '#fff',
                      border: '1px solid #ccc',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      lineHeight: 1,
                    }}
                  >
                    {hideCrossedOff ? <EyeOffIcon size={18} color={hideCrossedOff ? '#fff' : '#666'} /> : <EyeIcon size={18} color="#666" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMarked(true)}
                    title="מחק את כל הפריטים המסומנים"
                    aria-label="מחק את כל הפריטים המסומנים"
                    style={{
                      padding: '6px 10px',
                      background: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 13,
                      color: '#c00',
                    }}
                  >
                    <TrashIcon size={16} color="#c00" />
                    מחק מסומנים
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setCollapsedCategories(new Set())}
                title="פתח את כל הקטגוריות"
                aria-label="פתח את כל הקטגוריות"
                style={{
                  padding: '6px 8px',
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ExpandAllIcon size={20} color="#555" />
              </button>
              <button
                type="button"
                onClick={() => setCollapsedCategories(new Set(checkedItems.length > 0 ? [...categories, CHECKED_SECTION] : categories))}
                title="סגור את כל הקטגוריות"
                aria-label="סגור את כל הקטגוריות"
                style={{
                  padding: '6px 8px',
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CollapseAllIcon size={20} color="#555" />
              </button>
              <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
            </div>
            )}
          </>
        )}

        {isLoading ? (
          <p>טוען...</p>
        ) : (
          <>
          {searchQuery.trim() && filteredItems.length === 0 && (
            <p style={{ textAlign: 'center', color: '#999', fontSize: 14, margin: '20px 0' }}>
              לא נמצאו פריטים תואמים
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {categories.map((cat) => {
            const visibleItems = grouped[cat].filter((i) => !i.crossedOff);
            if (visibleItems.length === 0) return null;
            return (
            <section key={cat} ref={(el) => { categoryRefs.current[cat] = el; }} style={{ marginBottom: 24 }}>
              <div
                style={{
                  background: highlightedCategoryName === cat ? '#e8f5e9' : 'var(--color-bar)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'right',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat)) next.delete(cat);
                      else next.add(cat);
                      return next;
                    });
                    setHighlightedCategoryName(cat);
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    font: 'inherit',
                    textAlign: 'right',
                  }}
                  aria-expanded={!collapsedCategories.has(cat)}
                  aria-label={collapsedCategories.has(cat) ? `פתח קטגוריה ${cat}` : `סגור קטגוריה ${cat}`}
                >
                  <CategoryIcon iconId={getCategoryIconId(cat)} imageUrl={getCategoryImageUrl(cat)} size={24} />
                  <span style={{ fontWeight: 600 }}>{cat}</span>
                  <span style={{ fontSize: 13, fontWeight: 400, color: '#666', opacity: 0.9 }}>{visibleItems.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat)) next.delete(cat);
                      else next.add(cat);
                      return next;
                    });
                    setHighlightedCategoryName(cat);
                  }}
                  aria-expanded={!collapsedCategories.has(cat)}
                  aria-label={collapsedCategories.has(cat) ? `פתח קטגוריה ${cat}` : `סגור קטגוריה ${cat}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    color: '#555',
                  }}
                >
                  {collapsedCategories.has(cat) ? <ChevronRightIcon size={22} color="#555" /> : <ChevronDownIcon size={22} color="#555" />}
                </button>
              </div>
              {!collapsedCategories.has(cat) && (
              <SortableContext items={visibleItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {viewMode === 'list' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleItems.map((item) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ handleProps }) => (
                    <div
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        background: highlightedItemId === item.id ? '#e8f5e9' : '#fff',
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                    >
                      <span {...handleProps} style={{ cursor: 'grab', touchAction: 'none', color: '#bbb', fontSize: 18, flexShrink: 0, lineHeight: 1, padding: '0 2px' }} aria-label="גרור לשינוי סדר">⠿</span>
                      <input
                        type="checkbox"
                        checked={!!item.crossedOff}
                        onChange={() =>
                          updateMutation.mutate({
                            itemId: item.id,
                            body: { crossedOff: !item.crossedOff },
                          })
                        }
                        style={{ width: 22, height: 22, cursor: 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                        aria-label={item.crossedOff ? 'בטל סימון' : 'סימן'}
                      />
                      {(item.itemImageUrl || item.productImageUrl) ? (
                        <img
                          src={getImageUrl(item.itemImageUrl || item.productImageUrl)}
                          alt=""
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <CategoryIcon
                          iconId={item.iconId ?? item.categoryIconId ?? null}
                          imageUrl={null}
                          size={48}
                        />
                      )}
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}>
                        <div style={{ textDecoration: item.crossedOff ? 'line-through' : 'none', color: item.crossedOff ? 'var(--color-strike)' : 'inherit' }}>{item.displayName}</div>
                        {(formatQuantityUnit(item) || item.note) && (
                        <div style={{ fontSize: 14, color: '#666' }}>
                          {formatQuantityUnit(item) ?? ''}
                          {formatQuantityUnit(item) && item.note ? ' · ' : ''}
                          {item.note ?? ''}
                        </div>
                      )}
                      </div>
                      <AutoAddBadge rule={findRuleForItem(autoAddRules, item)} />
                      <button
                        type="button"
                        onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                        aria-label="ערוך פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', lineHeight: 1, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(item.id)}
                        aria-label="הסר פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', lineHeight: 1, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    )}
                  </SortableItem>
                ))}
              </div>
              ) : viewMode === 'compact' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibleItems.map((item) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ handleProps }) => (
                    <div
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        background: highlightedItemId === item.id ? '#e8f5e9' : '#fff',
                        borderRadius: 6,
                        borderBottom: '1px solid #f0f0f0',
                      }}
                    >
                      <span {...handleProps} style={{ cursor: 'grab', touchAction: 'none', color: '#ccc', fontSize: 14, flexShrink: 0, lineHeight: 1, padding: '0 1px' }} aria-label="גרור לשינוי סדר">⠿</span>
                      <input
                        type="checkbox"
                        checked={!!item.crossedOff}
                        onChange={() =>
                          updateMutation.mutate({
                            itemId: item.id,
                            body: { crossedOff: !item.crossedOff },
                          })
                        }
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                        aria-label={item.crossedOff ? 'בטל סימון' : 'סימן'}
                      />
                      <span
                        onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                        style={{
                        flex: 1,
                        fontSize: 14,
                        textDecoration: item.crossedOff ? 'line-through' : 'none',
                        color: item.crossedOff ? 'var(--color-strike)' : 'inherit',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer',
                      }}>
                        {item.displayName}
                      </span>
                      {formatQuantityUnit(item) && (
                        <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>
                          {formatQuantityUnit(item)}
                        </span>
                      )}
                      {item.note && (
                        <span style={{ fontSize: 11, color: '#aaa', flexShrink: 1, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.note}
                        </span>
                      )}
                      <AutoAddBadge rule={findRuleForItem(autoAddRules, item)} size={14} />
                      <button
                        type="button"
                        onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                        aria-label="ערוך פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <PencilIcon size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(item.id)}
                        aria-label="הסר פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                    )}
                  </SortableItem>
                ))}
              </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {visibleItems.map((item) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ handleProps }) => (
                    <div
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      style={{
                        position: 'relative',
                        padding: 10,
                        background: highlightedItemId === item.id ? '#e8f5e9' : '#fff',
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        textAlign: 'center',
                        opacity: item.crossedOff ? 0.6 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <input
                          type="checkbox"
                          checked={!!item.crossedOff}
                          onChange={() =>
                            updateMutation.mutate({
                              itemId: item.id,
                              body: { crossedOff: !item.crossedOff },
                            })
                          }
                          style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                          aria-label={item.crossedOff ? 'בטל סימון' : 'סימן'}
                        />
                        <span {...handleProps} style={{ cursor: 'grab', touchAction: 'none', color: '#bbb', fontSize: 16, lineHeight: 1 }} aria-label="גרור לשינוי סדר">⠿</span>
                        <AutoAddBadge rule={findRuleForItem(autoAddRules, item)} size={14} />
                        <button
                          type="button"
                          onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                          aria-label="ערוך פריט"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', lineHeight: 1, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                        >
                          <PencilIcon size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMutation.mutate(item.id)}
                          aria-label="הסר פריט"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', lineHeight: 1, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                      <div onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
                      {(item.itemImageUrl || item.productImageUrl) ? (
                        <img
                          src={getImageUrl(item.itemImageUrl || item.productImageUrl)}
                          alt=""
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <CategoryIcon
                          iconId={item.iconId ?? item.categoryIconId ?? null}
                          imageUrl={null}
                          size={48}
                        />
                      )}
                      <span style={{ fontWeight: 500, fontSize: 13, wordBreak: 'break-word', textDecoration: item.crossedOff ? 'line-through' : 'none', color: item.crossedOff ? 'var(--color-strike)' : 'inherit' }}>{item.displayName}</span>
                      {formatQuantityUnit(item) && (
                        <span style={{ fontSize: 11, color: '#666' }}>
                          {formatQuantityUnit(item)}
                        </span>
                      )}
                      {item.note && (
                        <span style={{ fontSize: 11, color: '#888', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.note}
                        </span>
                      )}
                      </div>
                    </div>
                    )}
                  </SortableItem>
                ))}
              </div>
              )}
              </SortableContext>
              )}
            </section>
            );
          })}
          {checkedItems.length > 0 && !hideCrossedOff && (
            <section
              ref={(el) => { categoryRefs.current[CHECKED_SECTION] = el; }}
              style={{
                marginTop: 28,
                paddingTop: 24,
                borderTop: '2px solid #e0e0e0',
              }}
            >
              <div
                style={{
                  background: highlightedCategoryName === CHECKED_SECTION ? '#e8f5e9' : '#f5f5f5',
                  padding: '8px 12px',
                  borderRadius: 8,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'right',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(CHECKED_SECTION)) next.delete(CHECKED_SECTION);
                      else next.add(CHECKED_SECTION);
                      return next;
                    });
                    setHighlightedCategoryName(CHECKED_SECTION);
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    font: 'inherit',
                    textAlign: 'right',
                  }}
                  aria-expanded={!collapsedCategories.has(CHECKED_SECTION)}
                  aria-label={collapsedCategories.has(CHECKED_SECTION) ? 'פתח פריטים מסומנים' : 'סגור פריטים מסומנים'}
                >
                  <span style={{ fontWeight: 600, color: '#666' }}>פריטים מסומנים</span>
                  <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>{checkedItems.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(CHECKED_SECTION)) next.delete(CHECKED_SECTION);
                      else next.add(CHECKED_SECTION);
                      return next;
                    });
                    setHighlightedCategoryName(CHECKED_SECTION);
                  }}
                  aria-expanded={!collapsedCategories.has(CHECKED_SECTION)}
                  aria-label={collapsedCategories.has(CHECKED_SECTION) ? 'פתח פריטים מסומנים' : 'סגור פריטים מסומנים'}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    color: '#555',
                  }}
                >
                  {collapsedCategories.has(CHECKED_SECTION) ? <ChevronRightIcon size={22} color="#555" /> : <ChevronDownIcon size={22} color="#555" />}
                </button>
              </div>
              {!collapsedCategories.has(CHECKED_SECTION) && (
              <SortableContext items={checkedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {viewMode === 'list' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checkedItems.map((item) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ handleProps }) => (
                    <div
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        background: highlightedItemId === item.id ? '#e8f5e9' : '#fafafa',
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      <span {...handleProps} style={{ cursor: 'grab', touchAction: 'none', color: '#bbb', fontSize: 18, flexShrink: 0, lineHeight: 1, padding: '0 2px' }} aria-label="גרור לשינוי סדר">⠿</span>
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          updateMutation.mutate({
                            itemId: item.id,
                            body: { crossedOff: false },
                          })
                        }
                        style={{ width: 22, height: 22, cursor: 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                        aria-label="בטל סימון"
                      />
                      {(item.itemImageUrl || item.productImageUrl) ? (
                        <img
                          src={getImageUrl(item.itemImageUrl || item.productImageUrl)}
                          alt=""
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <CategoryIcon
                          iconId={item.iconId ?? item.categoryIconId ?? null}
                          imageUrl={null}
                          size={48}
                        />
                      )}
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}>
                        <div style={{ textDecoration: 'line-through', color: 'var(--color-strike)' }}>{item.displayName}</div>
                        {(formatQuantityUnit(item) || item.note) && (
                        <div style={{ fontSize: 14, color: '#666' }}>
                          {formatQuantityUnit(item) ?? ''}
                          {formatQuantityUnit(item) && item.note ? ' · ' : ''}
                          {item.note ?? ''}
                        </div>
                      )}
                      </div>
                      <AutoAddBadge rule={findRuleForItem(autoAddRules, item)} />
                      <button
                        type="button"
                        onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                        aria-label="ערוך פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', lineHeight: 1, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(item.id)}
                        aria-label="הסר פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', lineHeight: 1, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    )}
                  </SortableItem>
                ))}
              </div>
              ) : viewMode === 'compact' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {checkedItems.map((item) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ handleProps }) => (
                    <div
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        background: highlightedItemId === item.id ? '#e8f5e9' : '#fafafa',
                        borderRadius: 6,
                        borderBottom: '1px solid #f0f0f0',
                      }}
                    >
                      <span {...handleProps} style={{ cursor: 'grab', touchAction: 'none', color: '#ccc', fontSize: 14, flexShrink: 0, lineHeight: 1, padding: '0 1px' }} aria-label="גרור לשינוי סדר">⠿</span>
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          updateMutation.mutate({
                            itemId: item.id,
                            body: { crossedOff: false },
                          })
                        }
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                        aria-label="בטל סימון"
                      />
                      <span
                        onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                        style={{
                          flex: 1,
                          fontSize: 14,
                          textDecoration: 'line-through',
                          color: 'var(--color-strike)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                        }}>
                        {item.displayName}
                      </span>
                      {formatQuantityUnit(item) && (
                        <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>
                          {formatQuantityUnit(item)}
                        </span>
                      )}
                      {item.note && (
                        <span style={{ fontSize: 11, color: '#aaa', flexShrink: 1, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.note}
                        </span>
                      )}
                      <AutoAddBadge rule={findRuleForItem(autoAddRules, item)} size={14} />
                      <button
                        type="button"
                        onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                        aria-label="ערוך פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <PencilIcon size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(item.id)}
                        aria-label="הסר פריט"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                    )}
                  </SortableItem>
                ))}
              </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {checkedItems.map((item) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ handleProps }) => (
                    <div
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      style={{
                        position: 'relative',
                        padding: 10,
                        background: highlightedItemId === item.id ? '#e8f5e9' : '#fafafa',
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        textAlign: 'center',
                        opacity: 0.85,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <input
                          type="checkbox"
                          checked
                          onChange={() =>
                            updateMutation.mutate({
                              itemId: item.id,
                              body: { crossedOff: false },
                            })
                          }
                          style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                          aria-label="בטל סימון"
                        />
                        <span {...handleProps} style={{ cursor: 'grab', touchAction: 'none', color: '#bbb', fontSize: 16, lineHeight: 1 }} aria-label="גרור לשינוי סדר">⠿</span>
                        <AutoAddBadge rule={findRuleForItem(autoAddRules, item)} size={14} />
                        <button
                          type="button"
                          onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)}
                          aria-label="ערוך פריט"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', lineHeight: 1, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                        >
                          <PencilIcon size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMutation.mutate(item.id)}
                          aria-label="הסר פריט"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', lineHeight: 1, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                      <div onClick={() => navigate(`/lists/${listId}/items/${item.id}/edit`)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
                      {(item.itemImageUrl || item.productImageUrl) ? (
                        <img
                          src={getImageUrl(item.itemImageUrl || item.productImageUrl)}
                          alt=""
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <CategoryIcon
                          iconId={item.iconId ?? item.categoryIconId ?? null}
                          imageUrl={null}
                          size={48}
                        />
                      )}
                      <span style={{ fontWeight: 500, fontSize: 13, wordBreak: 'break-word', textDecoration: 'line-through', color: 'var(--color-strike)' }}>{item.displayName}</span>
                      {formatQuantityUnit(item) && (
                        <span style={{ fontSize: 11, color: '#666' }}>
                          {formatQuantityUnit(item)}
                        </span>
                      )}
                      {item.note && (
                        <span style={{ fontSize: 11, color: '#888', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.note}
                        </span>
                      )}
                      </div>
                    </div>
                    )}
                  </SortableItem>
                ))}
              </div>
              )}
              </SortableContext>
              )}
            </section>
          )}
          </DndContext>
          </>
        )}

        {/* Delete confirmation dialog */}
        {confirmDelete && list && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              padding: 24,
            }}
            onClick={() => setConfirmDelete(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 24,
                maxWidth: 360,
                width: '100%',
              }}
            >
              <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>מחיקת רשימה</h3>
              <p style={{ margin: '0 0 20px', fontSize: 15, color: '#333', lineHeight: 1.6 }}>
                אתה באמת מעוניין למחוק את הרשימה <strong>{list.name}</strong>?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    deleteListMutation.mutate();
                    setConfirmDelete(false);
                  }}
                  disabled={deleteListMutation.isPending}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#c62828',
                    color: '#fff',
                    fontWeight: 600,
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 15,
                  }}
                >
                  {deleteListMutation.isPending ? 'מוחק...' : 'כן, מחק'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#eee',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 15,
                  }}
                >
                  לא
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete all marked items confirmation */}
        {confirmDeleteMarked && listId && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              padding: 24,
            }}
            onClick={() => !deleteMarkedMutation.isPending && setConfirmDeleteMarked(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 24,
                maxWidth: 360,
                width: '100%',
              }}
            >
              <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>מחיקת פריטים מסומנים</h3>
              <p style={{ margin: '0 0 20px', fontSize: 15, color: '#333', lineHeight: 1.6 }}>
                למחוק את כל {items.filter((i) => i.crossedOff).length} הפריטים המסומנים? לא ניתן לבטל.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const ids = items.filter((i) => i.crossedOff).map((i) => i.id);
                    deleteMarkedMutation.mutate(ids);
                  }}
                  disabled={deleteMarkedMutation.isPending}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#c62828',
                    color: '#fff',
                    fontWeight: 600,
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 15,
                  }}
                >
                  {deleteMarkedMutation.isPending ? 'מוחק...' : 'כן, מחק'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteMarked(false)}
                  disabled={deleteMarkedMutation.isPending}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#eee',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 15,
                  }}
                >
                  לא
                </button>
              </div>
            </div>
          </div>
        )}

        {attachCategoriesOpen && list && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="attach-categories-title"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              padding: 16,
            }}
            onClick={() => !attachCategoriesMutation.isPending && setAttachCategoriesOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 20,
                maxWidth: 420,
                width: '100%',
                maxHeight: '85vh',
                overflowY: 'auto',
                direction: 'rtl',
              }}
            >
              <h3 id="attach-categories-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
                צירוף קטגוריות לרשימה
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                בחרו קטגוריות לצירוף. הפריטים שלהן יוצעו באוטו-השלמה ובכפתור &quot;הוספה מקטגוריות&quot;.
              </p>
              <CategoryAttachPicker
                selectedIds={attachCategoriesDraft}
                categories={workspaceCategories}
                onSelectedIdsChange={setAttachCategoriesDraft}
                label=""
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => attachCategoriesMutation.mutate(attachCategoriesDraft)}
                  disabled={attachCategoriesMutation.isPending}
                  data-testid="attach-categories-save"
                  style={{
                    flex: 1,
                    padding: 12,
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontWeight: 600,
                    borderRadius: 8,
                    border: 'none',
                    cursor: attachCategoriesMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 15,
                  }}
                >
                  {attachCategoriesMutation.isPending ? 'שומר...' : 'שמור'}
                </button>
                <button
                  type="button"
                  onClick={() => setAttachCategoriesOpen(false)}
                  disabled={attachCategoriesMutation.isPending}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#eee',
                    borderRadius: 8,
                    border: 'none',
                    cursor: attachCategoriesMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 15,
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}

        {productBankSheetOpen && list && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-bank-sheet-title"
            data-testid="product-bank-sheet"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              zIndex: 1500,
            }}
            onClick={() => setProductBankSheetOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                width: '100%',
                maxWidth: 640,
                maxHeight: '92vh',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -8px 24px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                direction: 'rtl',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom: '1px solid #eee',
                  position: 'sticky',
                  top: 0,
                  background: '#fff',
                  borderRadius: '20px 20px 0 0',
                  zIndex: 1,
                }}
              >
                <h3 id="product-bank-sheet-title" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                  הוסף מקטגוריות
                </h3>
                <button
                  type="button"
                  onClick={() => setProductBankSheetOpen(false)}
                  aria-label="סגור"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 22,
                    color: '#666',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <ProductBankView
                  listId={list.id}
                  onItemAdded={(name) => showNotification(name ? `${name} נוסף לרשימה` : 'נוסף לרשימה')}
                />
              </div>
            </div>
          </div>
        )}

        {plaintextDialogOpen && (
          <PlaintextListDialog
            title="רשימה כטקסט"
            items={plaintextItems}
            onClose={() => setPlaintextDialogOpen(false)}
          />
        )}

      </main>
    </>
  );
}
