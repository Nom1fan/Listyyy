import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getList, updateList, deleteList } from '../api/lists';
import { getCategories } from '../api/products';
import { uploadFile } from '../api/client';
import { AppBar } from '../components/AppBar';
import { AutoAddSettings } from '../components/AutoAddSettings';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryAttachPicker } from '../components/CategoryAttachPicker';
import type { DisplayImageType } from '../components/DisplayImageForm';
import { ImageSourceDialog } from '../components/ImageSourceDialog';
import { EmojiPickerDialog } from '../components/EmojiPicker';
import { createPortal } from 'react-dom';

function getImageUrl(url: string | null): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = import.meta.env.VITE_API_BASE || '';
  return base + url;
}

function ImagePlaceholderIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function ListEdit() {
  const { listId } = useParams<{ listId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [displayImageType, setDisplayImageType] = useState<DisplayImageType>('icon');
  const [iconId, setIconId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageSourceDialogOpen, setImageSourceDialogOpen] = useState(false);
  const [showEmojiPickerDialog, setShowEmojiPickerDialog] = useState(false);
  const [attachedCategoryIds, setAttachedCategoryIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: list } = useQuery({
    queryKey: ['list', listId],
    queryFn: () => getList(listId!),
    enabled: !!listId,
  });

  const { data: workspaceCategories = [] } = useQuery({
    queryKey: ['categories', list?.workspaceId],
    queryFn: () => getCategories(list!.workspaceId),
    enabled: !!list?.workspaceId,
  });

  useEffect(() => {
    if (list) {
      setName(list.name);
      setDisplayImageType(list.imageUrl ? 'link' : 'icon');
      setIconId(list.iconId ?? '');
      setImageUrl(list.imageUrl ?? '');
      setAttachedCategoryIds(list.categoryIds ?? []);
    }
  }, [list]);

  const updateMutation = useMutation({
    mutationFn: (payload: { name?: string; iconId?: string | null; imageUrl?: string | null; version?: number; categoryIds?: string[] }) =>
      updateList(listId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list', listId] });
      queryClient.invalidateQueries({ queryKey: ['lists', list?.workspaceId] });
      navigate(`/lists/${listId}`);
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ['list', listId] });
      // Keep modal open; error could be shown via toast in parent
      console.error(err);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteList(listId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists', list?.workspaceId] });
      navigate('/lists');
    },
    onError: (err: Error) => console.error(err),
  });

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !listId) return;
    e.target.value = '';
    uploadFile(`/api/upload/list/${listId}`, file)
      .then(({ url }) => {
        setImageUrl(url);
        setDisplayImageType('link');
        queryClient.invalidateQueries({ queryKey: ['list', listId] });
        queryClient.invalidateQueries({ queryKey: ['lists', list?.workspaceId] });
      })
      .catch(console.error);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!list) return;
    const nameVal = name.trim() || list.name;
    const iconIdVal = displayImageType === 'icon' ? (iconId || '') : '';
    const imageUrlVal = (displayImageType === 'link' || displayImageType === 'web') ? (imageUrl.trim() || '') : '';
    updateMutation.mutate({
      name: nameVal,
      iconId: iconIdVal || undefined,
      imageUrl: imageUrlVal || undefined,
      version: list.version,
      categoryIds: attachedCategoryIds,
    });
  }

  if (!listId) {
    return <Navigate to="/lists" replace />;
  }
  if (!list) {
    return (
      <>
        <AppBar title="ערוך רשימה" backTo={`/lists/${listId}`} />
        <main style={{ padding: 16 }}><p>טוען...</p></main>
      </>
    );
  }

  const initialDisplayType: DisplayImageType = list.imageUrl ? 'link' : 'icon';
  const initialIconId = list.iconId ?? '';
  const initialImageUrl = list.imageUrl ?? '';
  const initialAttachedIds = list.categoryIds ?? [];
  const attachedIdsChanged =
    attachedCategoryIds.length !== initialAttachedIds.length ||
    [...attachedCategoryIds].sort().join(',') !== [...initialAttachedIds].sort().join(',');
  const isLinkOrWeb = displayImageType === 'link' || displayImageType === 'web';
  const hasChanges =
    name.trim() !== (list.name ?? '').trim() ||
    displayImageType !== initialDisplayType ||
    (displayImageType === 'icon' && (iconId || '') !== initialIconId) ||
    (isLinkOrWeb && (imageUrl.trim() || '') !== (initialImageUrl || '').trim()) ||
    attachedIdsChanged;

  const currentImageUrl = imageUrl.trim() || (list?.imageUrl ?? '');
  const showImage = isLinkOrWeb ? currentImageUrl : null;

  return (
    <>
      <AppBar title="ערוך רשימה" backTo={`/lists/${listId}`} />
      <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <button
            type="button"
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageFile}
        />
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>שם הרשימה</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הרשימה"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
          {workspaceCategories.length > 0 && (
            <CategoryAttachPicker
              selectedIds={attachedCategoryIds}
              categories={workspaceCategories}
              onSelectedIdsChange={setAttachedCategoryIds}
            />
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={updateMutation.isPending || !hasChanges}
              style={{
                flex: 1,
                minWidth: 100,
                padding: 12,
                background: updateMutation.isPending || !hasChanges ? '#ccc' : 'var(--color-primary)',
                color: updateMutation.isPending || !hasChanges ? '#666' : '#fff',
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: updateMutation.isPending || !hasChanges ? 'not-allowed' : 'pointer',
              }}
            >
              {updateMutation.isPending ? 'שומר...' : 'שמור'}
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
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMutation.isPending}
              style={{ padding: 12, background: '#c62828', color: '#fff', borderRadius: 8, border: 'none', cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer' }}
            >
              מחק
            </button>
          </div>
        </form>

        {listId && <AutoAddSettings listId={listId} />}

        {confirmDelete && (
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
                    deleteMutation.mutate();
                    setConfirmDelete(false);
                  }}
                  disabled={deleteMutation.isPending}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#c62828',
                    color: '#fff',
                    fontWeight: 600,
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {deleteMutation.isPending ? 'מוחק...' : 'כן, מחק'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{ flex: 1, padding: 12, background: '#eee', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                >
                  לא
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
