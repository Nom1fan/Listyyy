import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAutoAddRules,
  createAutoAddRule,
  updateAutoAddRule,
  deleteAutoAddRuleById,
  getListItems,
} from '../api/lists';
import { getProducts } from '../api/products';
import { ApiError } from '../api/client';
import { CategoryIcon } from './CategoryIcon';
import { CustomSelect } from './CustomSelect';
import { StepperInput } from './StepperInput';
import { AUTO_ADD_UNIT_OPTIONS, formatNextRun, formatRuleSummary } from '../utils/autoAdd';
import type { AutoAddRuleResponse } from '../types';

interface RuleTarget {
  productId?: string;
  customNameHe?: string;
  categoryId?: string;
  displayName: string;
  iconId: string | null;
  imageUrl: string | null;
}

/** Resolves a rule's live display name, icon and whether its item is currently on the list. */
function resolveRuleTarget(
  rule: AutoAddRuleResponse,
  products: { id: string; nameHe: string; iconId?: string | null; categoryIconId: string | null; imageUrl: string | null }[],
  items: { productId: string | null; customNameHe: string | null; displayName: string }[]
): { displayName: string; iconId: string | null; imageUrl: string | null; present: boolean } {
  if (rule.productId) {
    const product = products.find((p) => p.id === rule.productId);
    return {
      displayName: product?.nameHe ?? 'פריט',
      iconId: product?.iconId ?? product?.categoryIconId ?? null,
      imageUrl: product?.imageUrl ?? null,
      present: items.some((i) => i.productId === rule.productId),
    };
  }
  return {
    displayName: rule.customNameHe ?? 'פריט',
    iconId: null,
    imageUrl: null,
    present: items.some((i) => !i.productId && (i.customNameHe ?? i.displayName) === rule.customNameHe),
  };
}

export function AutoAddSettings({ listId }: { listId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoAddRuleResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutoAddRuleResponse | null>(null);

  const { data: autoAddRulesData } = useQuery({
    queryKey: ['autoAddRules', listId],
    queryFn: () => listAutoAddRules(listId),
  });
  const rules = Array.isArray(autoAddRulesData) ? autoAddRulesData : [];
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts(),
  });
  const { data: items = [] } = useQuery({
    queryKey: ['listItems', listId],
    queryFn: () => getListItems(listId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['autoAddRules', listId] });
  }

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      updateAutoAddRule(listId, ruleId, { enabled }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteAutoAddRuleById(listId, ruleId),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
  });

  function openAdd() {
    setEditingRule(null);
    setDialogOpen(true);
  }

  function openEdit(rule: AutoAddRuleResponse) {
    setEditingRule(rule);
    setDialogOpen(true);
  }

  return (
    <section aria-label="הוספה אוטומטית" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>הוספה אוטומטית</h3>
        <button
          type="button"
          onClick={openAdd}
          data-testid="auto-add-settings-add"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--color-primary)',
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + הוספה
        </button>
      </div>
      {rules.length === 0 ? (
        <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
          אין כללי הוספה אוטומטית. פריטים שנגמרו יתווספו מעצמם כשתגדירו כלל.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map((rule) => {
            const target = resolveRuleTarget(rule, products, items);
            return (
              <div
                key={rule.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: '#fff',
                  borderRadius: 10,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  opacity: rule.enabled ? 1 : 0.65,
                }}
              >
                <CategoryIcon iconId={target.iconId} imageUrl={target.imageUrl} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{target.displayName}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {formatRuleSummary(rule)}
                    {rule.enabled && rule.nextRunAt ? ` · הבאה: ${formatNextRun(rule.nextRunAt)}` : ''}
                    {!rule.enabled ? ' · מושהה' : ''}
                    {!target.present ? ' · לא ברשימה' : ''}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => toggleMutation.mutate({ ruleId: rule.id, enabled: e.target.checked })}
                  aria-label={`הפעל הוספה אוטומטית עבור ${target.displayName}`}
                  style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                />
                <button
                  type="button"
                  onClick={() => openEdit(rule)}
                  aria-label={`ערוך הוספה אוטומטית עבור ${target.displayName}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 13, padding: '4px 6px' }}
                >
                  ערוך
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(rule)}
                  aria-label={`מחק הוספה אוטומטית עבור ${target.displayName}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: 13, padding: '4px 6px' }}
                >
                  מחק
                </button>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen && (
        <AutoAddDialog
          listId={listId}
          rule={editingRule}
          products={products}
          items={items}
          rules={rules}
          onClose={() => setDialogOpen(false)}
          onSaved={invalidate}
        />
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
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
          onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%' }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>מחיקת הוספה אוטומטית</h3>
            <p style={{ margin: '0 0 20px', fontSize: 15, color: '#333', lineHeight: 1.6 }}>
              למחוק את ההוספה האוטומטית של <strong>{resolveRuleTarget(deleteTarget, products, items).displayName}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                style={{ flex: 1, padding: 12, background: '#c62828', color: '#fff', fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15 }}
              >
                {deleteMutation.isPending ? 'מוחק...' : 'כן, מחק'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                style={{ flex: 1, padding: 12, background: '#eee', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15 }}
              >
                לא
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface DialogProps {
  listId: string;
  /** Null when creating a new rule. */
  rule: AutoAddRuleResponse | null;
  products: {
    id: string;
    nameHe: string;
    categoryId: string;
    categoryNameHe: string;
    iconId?: string | null;
    categoryIconId: string | null;
    imageUrl: string | null;
  }[];
  items: {
    id: string;
    productId: string | null;
    customNameHe: string | null;
    displayName: string;
    categoryId: string | null;
    iconId?: string | null;
    categoryIconId: string | null;
    itemImageUrl: string | null;
    productImageUrl: string | null;
  }[];
  rules: AutoAddRuleResponse[];
  onClose: () => void;
  onSaved: () => void;
}

function AutoAddDialog({ listId, rule, products, items, rules, onClose, onSaved }: DialogProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<RuleTarget | null>(null);
  const [quantity, setQuantity] = useState(rule ? String(rule.quantity) : '1');
  const [everyN, setEveryN] = useState(rule ? String(rule.everyN) : '1');
  const [unit, setUnit] = useState<string>(rule ? rule.everyUnit : 'WEEKS');
  const [enabled, setEnabled] = useState(rule ? rule.enabled : true);
  const [saveError, setSaveError] = useState<string | null>(null);

  const candidates = useMemo<RuleTarget[]>(() => {
    if (rule) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const ruledProductIds = new Set(rules.filter((r) => r.productId).map((r) => r.productId as string));
    const ruledCustoms = new Set(rules.filter((r) => !r.productId).map((r) => r.customNameHe));
    const out: RuleTarget[] = [];
    for (const item of items) {
      if (item.productId) continue;
      const key = item.customNameHe ?? item.displayName;
      if (!item.displayName.toLowerCase().includes(q) || ruledCustoms.has(key)) continue;
      out.push({
        customNameHe: key,
        categoryId: item.categoryId ?? undefined,
        displayName: item.displayName,
        iconId: item.iconId ?? item.categoryIconId ?? null,
        imageUrl: item.itemImageUrl ?? item.productImageUrl ?? null,
      });
      if (out.length >= 7) break;
    }
    for (const p of products) {
      if (out.length >= 7) break;
      if (!p.nameHe.toLowerCase().includes(q) || ruledProductIds.has(p.id)) continue;
      out.push({
        productId: p.id,
        displayName: p.nameHe,
        iconId: p.iconId ?? p.categoryIconId ?? null,
        imageUrl: p.imageUrl,
      });
    }
    return out;
  }, [rule, search, products, items, rules]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(quantity);
      const every = parseInt(everyN, 10);
      if (isNaN(qty) || qty <= 0) throw new Error('כמות להוספה חייבת להיות מספר חיובי');
      if (isNaN(every) || every < 1) throw new Error('תדירות חייבת להיות מספר חיובי');
      if (rule) {
        return updateAutoAddRule(listId, rule.id, { quantity: qty, everyN: every, everyUnit: unit, enabled });
      }
      if (!picked) throw new Error('יש לבחור פריט');
      return createAutoAddRule(listId, {
        ...(picked.productId ? { productId: picked.productId } : { customNameHe: picked.customNameHe, categoryId: picked.categoryId }),
        quantity: qty,
        everyN: every,
        everyUnit: unit,
        enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoAddRules', listId] });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      setSaveError(err instanceof ApiError ? err.message : err.message || 'שגיאה בשמירה');
    },
  });

  const targetName = rule
    ? (rule.productId ? products.find((p) => p.id === rule.productId)?.nameHe ?? 'פריט' : (rule.customNameHe ?? 'פריט'))
    : picked?.displayName;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={rule ? 'עריכת הוספה אוטומטית' : 'הוספה אוטומטית חדשה'}
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
      onClick={() => !saveMutation.isPending && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 20, maxWidth: 420, width: '100%', maxHeight: '85vh', overflowY: 'auto', direction: 'rtl' }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>{rule ? 'עריכת הוספה אוטומטית' : 'הוספה אוטומטית חדשה'}</h3>

        {!rule && !picked && (
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש פריט..."
              data-testid="auto-add-settings-search"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', fontSize: 15 }}
            />
            {candidates.length > 0 && (
              <div role="listbox" style={{ marginTop: 4, border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
                {candidates.map((c) => (
                  <button
                    key={c.productId ?? c.customNameHe ?? c.displayName}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setPicked(c);
                      setSearch('');
                    }}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                      borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: 8, fontSize: 15, textAlign: 'right',
                    }}
                  >
                    <CategoryIcon iconId={c.iconId} imageUrl={c.imageUrl} size={24} />
                    <span style={{ flex: 1 }}>{c.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(rule || picked) && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{targetName}</div>
            {!rule && (
              <button
                type="button"
                onClick={() => setPicked(null)}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0, marginBottom: 12 }}
              >
                בחירת פריט אחר
              </button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>כמות להוספה</label>
                <StepperInput value={quantity} onChange={setQuantity} testId="auto-add-settings-quantity" ariaLabel="כמות להוספה" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>כל</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <StepperInput value={everyN} onChange={setEveryN} integer testId="auto-add-settings-every" ariaLabel="תדירות" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <CustomSelect value={unit} onChange={setUnit} aria-label="יחידת זמן" options={AUTO_ADD_UNIT_OPTIONS} />
                  </div>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  data-testid="auto-add-settings-enabled"
                  style={{ width: 18, height: 18, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                הוספה אוטומטית פעילה
              </label>
            </div>
          </>
        )}

        {saveError && (
          <div style={{ marginTop: 12, padding: 10, background: '#ffebee', color: '#c62828', borderRadius: 8, fontSize: 14 }}>
            {saveError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!rule && !picked)}
            data-testid="auto-add-settings-save"
            style={{
              flex: 1, padding: 12,
              background: saveMutation.isPending || (!rule && !picked) ? '#ccc' : 'var(--color-primary)',
              color: '#fff', fontWeight: 600, borderRadius: 8, border: 'none',
              cursor: saveMutation.isPending || (!rule && !picked) ? 'not-allowed' : 'pointer', fontSize: 15,
            }}
          >
            {saveMutation.isPending ? 'שומר...' : 'שמור'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saveMutation.isPending}
            style={{ flex: 1, padding: 12, background: '#eee', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15 }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
