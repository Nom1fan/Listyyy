export interface AuthResponse {
  token: string;
  userId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  locale: string;
}

export interface ListResponse {
  id: string;
  name: string;
  workspaceId: string;
  iconId: string | null;
  imageUrl: string | null;
  sortOrder: number;
  /**
   * Categories attached to this list. When empty, the list has no
   * auto-completion or "add from categories" affordance. When non-empty,
   * search auto-completes from products in these categories and the
   * "add from categories" button is shown.
   */
  categoryIds: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Number of items on the list (included when listing lists). */
  itemCount?: number;
}

export interface ListItemResponse {
  id: string;
  listId: string;
  productId: string | null;
  customNameHe: string | null;
  displayName: string;
  categoryId: string | null;
  categoryNameHe: string | null;
  categoryIconId: string | null;
  /** Product icon override when set; use iconId ?? categoryIconId for display */
  iconId?: string | null;
  quantity: number;
  unit: string;
  /** When true, show quantity+unit on list even if "1 יחידה" (user explicitly expanded unit section). */
  showQuantityUnit: boolean;
  note: string | null;
  crossedOff: boolean;
  itemImageUrl: string | null;
  productImageUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CategoryDto {
  id: string;
  workspaceId: string;
  nameHe: string;
  iconId: string | null;
  imageUrl: string | null;
  sortOrder: number;
  /** Total list-item adds for products in this category (for frequency sort). */
  addCount: number;
  version: number;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  iconId: string | null;
  memberCount: number;
  role: string;
  version: number;
}

export interface ProductDto {
  id: string;
  categoryId: string;
  categoryNameHe: string;
  categoryIconId: string | null;
  /** Product-level icon override; when set, use this instead of categoryIconId */
  iconId?: string | null;
  nameHe: string;
  defaultUnit: string;
  imageUrl: string | null;
  /** Permanent note on this product (set at category level). */
  note: string | null;
  /** Optional shared section/group name inside the product's category. */
  sectionNameHe?: string | null;
  /** Times this product was added to any list (for frequency sort). */
  addCount: number;
  version: number;
}

export interface ListEvent {
  type: 'ADDED' | 'REMOVED' | 'UPDATED';
  listId: string;
  itemId: string;
  itemDisplayName: string;
  quantityUnit: string;
  userId: string;
  userDisplayName: string;
}

export interface WorkspaceEvent {
  entityType: 'WORKSPACE' | 'CATEGORY' | 'PRODUCT' | 'LIST' | 'INVITATION';
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'REJECTED';
  workspaceId: string;
  entityId: string;
  entityName: string;
  userId: string;
  userDisplayName: string;
}

/** Event sent to /topic/user/{userId} (new invitation, removed from workspace). */
export interface UserEvent {
  type: 'NEW_INVITATION' | 'REMOVED_FROM_WORKSPACE';
  workspaceId?: string;
}

export type AutoAddUnit = 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';

export interface AutoAddRuleResponse {
  id: string;
  listId: string;
  productId: string | null;
  customNameHe: string | null;
  quantity: number;
  unit: string;
  everyN: number;
  everyUnit: AutoAddUnit;
  enabled: boolean;
  nextRunAt: string | null;
  version: number;
}

export interface ListMemberDto {
  userId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  /** True when invitation is pending (not yet accepted). */
  pending?: boolean;
  invitedAt?: string; // ISO date
}

export interface WorkspaceInvitationDto {
  workspaceId: string;
  workspaceName: string;
  inviterDisplayName: string;
  invitedAt: string; // ISO date
}

