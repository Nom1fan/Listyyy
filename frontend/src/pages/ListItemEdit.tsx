import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getList,
  getListItems,
  updateListItem,
  updateList,
  removeListItem,
  getAutoAddRule,
  upsertAutoAddRule,
} from '../api/lists';
import { getCategories, getProducts, updateProduct, createCategory } from '../api/products';
import { uploadFile, ApiError } from '../api/client';
import { AppBar } from '../components/AppBar';
import { CategoryIcon } from '../components/CategoryIcon';
import { CustomSelect } from '../components/CustomSelect';
import type { DisplayImageType } from '../components/DisplayImageForm';
import { ImageSourceDialog } from '../components/ImageSourceDialog';
import { EmojiPickerDialog } from '../components/EmojiPicker';
import { createPortal } from 'react-dom';
import type { ProductDto } from '../types';
import { AUTO_ADD_UNIT_OPTIONS, formatNextRun } from '../utils/autoAdd';

function getImageUrl(url: string | null): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = import.meta.env.VITE_API_BASE || '';
  return base + url;
}

/** Camera / picture-in-frame placeholder for empty image slot */
function ImagePlaceholderIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function ListItemEdit() {
  const { listId, itemId } = useParams<{ listId: string; itemId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [displayImageType, setDisplayImageType] = useState<DisplayImageType>('icon');
  const [iconId, setIconId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageSourceDialogOpen, setImageSourceDialogOpen] = useState(false);
  const [showEmojiPickerDialog, setShowEmojiPickerDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [unitSectionExpanded, setUnitSectionExpanded] = useState(false);
  const [autoAddEnabled, setAutoAddEnabled] = useState(false);
  const [autoAddQuantity, setAutoAddQuantity] = useState('1');
  const [autoAddEveryN, setAutoAddEveryN] = useState('1');
  const [autoAddUnit, setAutoAddUnit] = useState('WEEKS');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingHighlightRef = useRef<{ categoryId: string; itemId: string } | null>(null);
  const pendingAutoAddRef = useRef<{ quantity: number; everyN: number; everyUnit: string; enabled: boolean } | null>(null);
  const autoAddInitRef = useRef(false);

  const { data: list } = useQuery({
    queryKey: ['list', listId],
    queryFn: () => getList(listId!),
    enabled: !!listId,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['listItems', listId],
    queryFn: () => getListItems(listId!),
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

  const { data: autoAddRule, isFetched: autoAddFetched } = useQuery({
    queryKey: ['autoAdd', listId, itemId],
    queryFn: () => getAutoAddRule(listId!, itemId!),
    enabled: !!listId && !!itemId,
  });

  const item = items.find((i) => i.id === itemId);

  useEffect(() => {
    if (item) {
      setName(item.displayName);
      setQuantity(String(item.quantity));
      setUnit(item.unit || '');
      setNote(item.note || '');
      setCategoryId(item.categoryId || '');
      setDisplayImageType(item.itemImageUrl || item.productImageUrl ? 'link' : 'icon');
      setIconId(item.iconId ?? item.categoryIconId ?? '');
      setImageUrl(item.itemImageUrl || item.productImageUrl || '');
      const hasUnit = (item.unit ?? '').trim() !== '' && item.unit !== 'יחידה';
      const hasNonDefaultQty = Number(item.quantity) !== 1;
      setUnitSectionExpanded(Boolean(item.showQuantityUnit) || hasUnit || hasNonDefaultQty);
    }
  }, [item]);

  useEffect(() => {
    if (autoAddRule) {
      setAutoAddEnabled(autoAddRule.enabled);
      setAutoAddQuantity(String(autoAddRule.quantity));
      setAutoAddEveryN(String(autoAddRule.everyN));
      setAutoAddUnit(autoAddRule.everyUnit);
      autoAddInitRef.current = true;
    } else if (item && !autoAddInitRef.current) {
      setAutoAddQuantity(String(item.quantity));
    }
  }, [autoAddRule, item]);

  function finishItemSave() {
    setIsSaving(false);
    setSaveError(null);
    queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    const highlight = pendingHighlightRef.current;
    pendingHighlightRef.current = null;
    if (highlight) {
      navigate(`/lists/${listId}`, { state: { highlightCategoryId: highlight.categoryId, highlightItemId: highlight.itemId } });
    } else {
      navigate(`/lists/${listId}`);
    }
  }

  const autoAddMutation = useMutation({
    mutationFn: (body: { quantity: number; everyN: number; everyUnit: string; enabled: boolean }) =>
      upsertAutoAddRule(listId!, itemId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoAdd', listId, itemId] });
      finishItemSave();
    },
    onError: (err: Error) => {
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ['autoAdd', listId, itemId] });
      setSaveError(err instanceof ApiError ? err.message : err.message || 'שגיאה בשמירת הוספה אוטומטית');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      body,
    }: {
      body: { crossedOff?: boolean; quantity?: number; unit?: string; note?: string; itemImageUrl?: string | null; iconId?: string | null; categoryId?: string; clearCategory?: boolean; version?: number; customNameHe?: string };
    }) => updateListItem(listId!, itemId!, body),
    onSuccess: () => {
      const autoAddBody = pendingAutoAddRef.current;
      pendingAutoAddRef.current = null;
      if (autoAddBody) {
        autoAddMutation.mutate(autoAddBody);
      } else {
        finishItemSave();
      }
    },
    onError: (err: Error) => {
      setIsSaving(false);
      pendingAutoAddRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      setSaveError(err instanceof ApiError ? err.message : err.message || 'שגיאה בשמירה');
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ productId, imageUrl, iconId, version }: { productId: string; imageUrl: string | null; iconId: string; version?: number }) =>
      updateProduct(productId, { imageUrl, iconId, version }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeListItem(listId!, itemId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      navigate(`/lists/${listId}`);
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!item || !listId || !itemId) return;
    if (autoAddEnabled) {
      const autoQty = parseFloat(autoAddQuantity);
      const autoEvery = parseInt(autoAddEveryN, 10);
      if (isNaN(autoQty) || autoQty <= 0) {
        setSaveError('כמות להוספה חייבת להיות מספר חיובי');
        return;
      }
      if (isNaN(autoEvery) || autoEvery < 1) {
        setSaveError('תדירות חייבת להיות מספר חיובי');
        return;
      }
    }
    setIsSaving(true);
    let effectiveCategoryId = categoryId;
    if (categoryId === '__new__' && newCategoryName.trim() && list?.workspaceId) {
      try {
        const newCategory = await createCategory({
          nameHe: newCategoryName.trim(),
          workspaceId: list.workspaceId,
        });
        queryClient.invalidateQueries({ queryKey: ['categories', list.workspaceId] });
        effectiveCategoryId = newCategory.id;
        // Auto-attach the freshly-created category to the current list so that
        // auto-completion and "add from categories" surface it without an extra step.
        if (!list.categoryIds.includes(newCategory.id)) {
          try {
            await updateList(list.id, {
              categoryIds: [...list.categoryIds, newCategory.id],
              version: list.version,
            });
            queryClient.invalidateQueries({ queryKey: ['list', list.id] });
            queryClient.invalidateQueries({ queryKey: ['lists'] });
          } catch (err) {
            console.warn('Failed to auto-attach new category to list', err);
          }
        }
      } catch (err) {
        setIsSaving(false);
        setSaveError(err instanceof ApiError ? err.message : 'שגיאה ביצירת קטגוריה');
        return;
      }
    } else if (categoryId === '__new__') {
      effectiveCategoryId = item.categoryId || '';
    }
    const body: Record<string, unknown> = {
      version: item.version != null ? Number(item.version) : 0,
      showQuantityUnit: unitSectionExpanded,
    };
    const newQty = parseFloat(quantity);
    if (!isNaN(newQty) && newQty !== item.quantity) body.quantity = newQty;
    if (unit !== (item.unit || '')) body.unit = unit;
    if (note !== (item.note || '')) body.note = note;
    if (effectiveCategoryId && effectiveCategoryId !== (item.categoryId || '')) {
      body.categoryId = effectiveCategoryId;
    } else if (!effectiveCategoryId && (item.categoryId || item.productId)) {
      body.clearCategory = true;
    }
    if (name.trim() !== item.displayName) {
      body.customNameHe = name.trim();
    }
    const newImageUrl = displayImageType === 'icon' ? '' : (imageUrl.trim() || '');
    const origImageUrl = item.itemImageUrl || '';
    if (newImageUrl !== origImageUrl) body.itemImageUrl = newImageUrl;
    const newIconId = displayImageType === 'icon' ? (iconId || '') : '';
    const origIconId = item.iconId ?? '';
    if (newIconId !== origIconId) body.iconId = newIconId;
    const productId = item.productId;
    if (productId && displayImageType === 'icon' && newIconId !== origIconId) {
      const product = allProducts.find((p: ProductDto) => p.id === productId);
      updateProductMutation.mutate({
        productId,
        imageUrl: '',
        iconId: newIconId,
        version: product?.version,
      });
    }
    // Sync image to product so category view shows the same image
    if (productId && (displayImageType === 'link' || displayImageType === 'web') && newImageUrl !== (item.productImageUrl || '')) {
      const product = allProducts.find((p: ProductDto) => p.id === productId);
      updateProductMutation.mutate({
        productId,
        imageUrl: newImageUrl || null,
        iconId: '',
        version: product?.version,
      });
    }
    if (effectiveCategoryId !== (item.categoryId || '') || body.clearCategory) {
      const targetCategoryId = effectiveCategoryId || '';
      pendingHighlightRef.current = { categoryId: targetCategoryId, itemId: itemId! };
    }
    if (autoAddFetched && isAutoAddDirty()) {
      pendingAutoAddRef.current = {
        quantity: autoAddEnabled ? parseFloat(autoAddQuantity) : Number(autoAddRule?.quantity ?? item.quantity),
        everyN: autoAddEnabled ? parseInt(autoAddEveryN, 10) : (autoAddRule?.everyN ?? 1),
        everyUnit: autoAddEnabled ? autoAddUnit : (autoAddRule?.everyUnit ?? 'WEEKS'),
        enabled: autoAddEnabled,
      };
    }
    updateMutation.mutate({
      body: body as { version?: number; quantity?: number; unit?: string; showQuantityUnit?: boolean; note?: string; categoryId?: string; clearCategory?: boolean; itemImageUrl?: string | null; iconId?: string | null; customNameHe?: string },
    });
  }

  function isAutoAddDirty(): boolean {
    if (!item) return false;
    if (autoAddEnabled !== (autoAddRule?.enabled ?? false)) return true;
    if (!autoAddEnabled) return false;
    if (String(parseFloat(autoAddQuantity) || 0) !== String(autoAddRule?.quantity ?? item.quantity)) return true;
    if (String(parseInt(autoAddEveryN, 10) || 0) !== String(autoAddRule?.everyN ?? 1)) return true;
    return autoAddUnit !== (autoAddRule?.everyUnit ?? 'WEEKS');
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !listId || !itemId) return;
    e.target.value = '';
    uploadFile(`/api/upload/lists/${listId}/items/${itemId}`, file)
      .then(({ url }) => {
        setImageUrl(url);
        setDisplayImageType('link');
        queryClient.invalidateQueries({ queryKey: ['listItems', listId] });
      })
      .catch(console.error);
  }

  if (!listId || !itemId) {
    return <Navigate to="/lists" replace />;
  }
  if (items.length > 0 && !item) {
    return <Navigate to={`/lists/${listId}`} replace />;
  }
  if (!item) {
    return (
      <>
        <AppBar title="עריכת פריט" backTo={`/lists/${listId}`} />
        <main style={{ padding: 16 }}><p>טוען...</p></main>
      </>
    );
  }

  const initialDisplayType: DisplayImageType = item.itemImageUrl || item.productImageUrl ? 'link' : 'icon';
  const initialIconId = item.iconId ?? '';
  const initialImageUrl = item.itemImageUrl || item.productImageUrl || '';
  const isLinkOrWeb = displayImageType === 'link' || displayImageType === 'web';
  const hasUnit = ((item.unit ?? '').trim() !== '' && item.unit !== 'יחידה');
  const hasNonDefaultQty = Number(item.quantity) !== 1;
  const initialUnitSectionExpanded = Boolean(item.showQuantityUnit) || hasUnit || hasNonDefaultQty;
  const effectiveCategoryId = categoryId === '__new__' ? (newCategoryName.trim() ? '__new__' : (item.categoryId || '')) : categoryId;
  const hasChanges =
    name.trim() !== (item.displayName ?? '').trim() ||
    String(parseFloat(quantity) || 1) !== String(item.quantity) ||
    (unit || '') !== (item.unit || '') ||
    (note || '') !== (item.note || '') ||
    effectiveCategoryId !== (item.categoryId || '') ||
    unitSectionExpanded !== initialUnitSectionExpanded ||
    displayImageType !== initialDisplayType ||
    (displayImageType === 'icon' && (iconId || '') !== initialIconId) ||
    (isLinkOrWeb && (imageUrl.trim() || '') !== (initialImageUrl || '').trim()) ||
    (autoAddFetched && isAutoAddDirty());

  const currentImageUrl = imageUrl.trim() || (item.itemImageUrl || item.productImageUrl || '');
  const showImage = isLinkOrWeb ? currentImageUrl : null;

  return (
    <>
      <AppBar title="עריכת פריט" backTo={`/lists/${listId}`} />
      <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <button
            type="button"
            data-testid="edit-item-image-button"
            onClick={() => setImageSourceDialogOpen(true)}
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: showImage || (displayImageType === 'icon' && iconId) ? 'transparent' : '#e8e8e8',
              border: '2px solid #ddd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showImage ? (
              <img
                src={getImageUrl(showImage)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : displayImageType === 'icon' && iconId ? (
              <CategoryIcon iconId={iconId} imageUrl={null} size={64} />
            ) : (
              <span style={{ color: '#999' }}><ImagePlaceholderIcon size={48} /></span>
            )}
          </button>
          <ImageSourceDialog
            open={imageSourceDialogOpen}
            onClose={() => setImageSourceDialogOpen(false)}
            onSelectIcon={() => {
              setDisplayImageType('icon');
              setImageUrl('');
              setShowEmojiPickerDialog(true);
            }}
            onSelectDevice={() => {
              setDisplayImageType('device');
              setImageUrl('');
              setTimeout(() => fileInputRef.current?.click(), 0);
            }}
            initialLinkUrl={isLinkOrWeb ? imageUrl : ''}
            onLinkSubmit={(url) => {
              setDisplayImageType('link');
              setImageUrl(url);
            }}
            onSearchSelect={(url) => {
              setDisplayImageType('web');
              setImageUrl(url);
            }}
          />
          {showEmojiPickerDialog &&
            createPortal(
              <EmojiPickerDialog
                selectedEmoji={iconId}
                onSelect={(emoji) => {
                  setIconId(emoji);
                  setShowEmojiPickerDialog(false);
                }}
                onClose={() => setShowEmojiPickerDialog(false)}
              />,
              document.body,
            )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>שם פריט</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            {unitSectionExpanded ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 14 }}>יחידה וכמות</label>
                  <button
                    type="button"
                    onClick={() => setUnitSectionExpanded(false)}
                    style={{
                      fontSize: 12,
                      color: '#666',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                  >
                    הסתר יחידה
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="יחידה (למשל ליטר, קילו)"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const n = parseFloat(quantity) || 1;
                          if (n > 1) setQuantity(String(n - 1));
                        }}
                        style={{
                          width: 36, height: 40, border: '1px solid #ccc', borderRadius: '8px 0 0 8px',
                          background: '#f5f5f5', cursor: 'pointer', fontSize: 18, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        onBlur={() => {
                          const n = parseFloat(quantity);
                          if (isNaN(n) || n <= 0) setQuantity('1');
                        }}
                        style={{
                          width: 56, height: 40, border: '1px solid #ccc', borderLeft: 'none', borderRight: 'none',
                          textAlign: 'center', fontSize: 16, padding: 0, boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const n = parseFloat(quantity) || 0;
                          setQuantity(String(n + 1));
                        }}
                        style={{
                          width: 36, height: 40, border: '1px solid #ccc', borderRadius: '0 8px 8px 0',
                          background: '#f5f5f5', cursor: 'pointer', fontSize: 18, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setUnitSectionExpanded(true)}
                style={{
                  fontSize: 13,
                  color: '#666',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                הוסף יחידה וכמות (אופציונלי)
              </button>
            )}
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>הערה</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="אופציונלי"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          {(workspaceCategories.length > 0 || list?.workspaceId) && (
            <div>
              <CustomSelect
                label="קטגוריה"
                value={categoryId}
                onChange={setCategoryId}
                placeholder="ללא קטגוריה (אחר)"
                options={[
                  { value: '', label: 'ללא קטגוריה (אחר)' },
                  ...workspaceCategories.map((cat) => ({
                    value: cat.id,
                    label: cat.nameHe,
                    icon: <CategoryIcon iconId={cat.iconId} imageUrl={cat.imageUrl} size={20} />,
                  })),
                  { value: '__new__', label: '➕ קטגוריה חדשה...' },
                ]}
              />
              {categoryId === '__new__' && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="שם הקטגוריה"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
          )}
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoAddEnabled}
                onChange={(e) => setAutoAddEnabled(e.target.checked)}
                data-testid="auto-add-toggle"
                style={{ width: 20, height: 20, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
              />
              תדירות הוספה אוטומטית
            </label>
            {autoAddEnabled && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>כמות להוספה</label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const n = parseFloat(autoAddQuantity) || 1;
                        if (n > 1) setAutoAddQuantity(String(n - 1));
                      }}
                      aria-label="הפחת כמות להוספה"
                      style={{
                        width: 36, height: 40, border: '1px solid #ccc', borderRadius: '8px 0 0 8px',
                        background: '#f5f5f5', cursor: 'pointer', fontSize: 18, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={autoAddQuantity}
                      onChange={(e) => setAutoAddQuantity(e.target.value)}
                      onBlur={() => {
                        const n = parseFloat(autoAddQuantity);
                        if (isNaN(n) || n <= 0) setAutoAddQuantity('1');
                      }}
                      data-testid="auto-add-quantity"
                      aria-label="כמות להוספה"
                      style={{
                        width: 56, height: 40, border: '1px solid #ccc', borderLeft: 'none', borderRight: 'none',
                        textAlign: 'center', fontSize: 16, padding: 0, boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const n = parseFloat(autoAddQuantity) || 0;
                        setAutoAddQuantity(String(n + 1));
                      }}
                      aria-label="הוסף כמות להוספה"
                      style={{
                        width: 36, height: 40, border: '1px solid #ccc', borderRadius: '0 8px 8px 0',
                        background: '#f5f5f5', cursor: 'pointer', fontSize: 18, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>כל</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const n = parseInt(autoAddEveryN, 10) || 1;
                          if (n > 1) setAutoAddEveryN(String(n - 1));
                        }}
                        aria-label="הפחת תדירות"
                        style={{
                          width: 36, height: 40, border: '1px solid #ccc', borderRadius: '8px 0 0 8px',
                          background: '#f5f5f5', cursor: 'pointer', fontSize: 18, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={autoAddEveryN}
                        onChange={(e) => setAutoAddEveryN(e.target.value)}
                        onBlur={() => {
                          const n = parseInt(autoAddEveryN, 10);
                          if (isNaN(n) || n < 1) setAutoAddEveryN('1');
                        }}
                        data-testid="auto-add-every"
                        aria-label="תדירות"
                        style={{
                          width: 56, height: 40, border: '1px solid #ccc', borderLeft: 'none', borderRight: 'none',
                          textAlign: 'center', fontSize: 16, padding: 0, boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const n = parseInt(autoAddEveryN, 10) || 0;
                          setAutoAddEveryN(String(n + 1));
                        }}
                        aria-label="הגבר תדירות"
                        style={{
                          width: 36, height: 40, border: '1px solid #ccc', borderRadius: '0 8px 8px 0',
                          background: '#f5f5f5', cursor: 'pointer', fontSize: 18, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        +
                      </button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <CustomSelect
                        value={autoAddUnit}
                        onChange={setAutoAddUnit}
                        aria-label="יחידת זמן"
                        options={AUTO_ADD_UNIT_OPTIONS}
                      />
                    </div>
                  </div>
                </div>
                {autoAddRule?.enabled && autoAddRule.nextRunAt && (
                  <div data-testid="auto-add-next-run" style={{ fontSize: 13, color: '#666' }}>
                    הוספה הבאה: {formatNextRun(autoAddRule.nextRunAt)}
                  </div>
                )}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageFile}
          />
          {saveError && (
            <div style={{ padding: 10, background: '#ffebee', color: '#c62828', borderRadius: 8, fontSize: 14 }}>
              {saveError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={isSaving || updateMutation.isPending || autoAddMutation.isPending || !hasChanges}
              style={{
                flex: 1,
                padding: 12,
                background: isSaving || updateMutation.isPending || autoAddMutation.isPending || !hasChanges ? '#ccc' : 'var(--color-primary)',
                color: isSaving || updateMutation.isPending || autoAddMutation.isPending || !hasChanges ? '#666' : '#fff',
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: isSaving || updateMutation.isPending || autoAddMutation.isPending || !hasChanges ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving || updateMutation.isPending || autoAddMutation.isPending ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/lists/${listId}`)}
              style={{ padding: 12, background: '#eee', borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              style={{
                padding: 12,
                background: '#c62828',
                color: '#fff',
                borderRadius: 8,
                border: 'none',
                cursor: removeMutation.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              מחק
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
