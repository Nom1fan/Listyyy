import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ListDetail } from './ListDetail'
import { ListItemEdit } from './ListItemEdit'
import { ListEdit } from './ListEdit'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

function Wrapper({
  children,
  initialEntries = ['/lists/list1'],
}: {
  children: React.ReactNode
  initialEntries?: Array<string | { pathname: string; state?: { highlightCategoryId?: string; highlightItemId?: string } }>
}) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/lists/:listId" element={children} />
          <Route path="/lists/:listId/items/:itemId/edit" element={<ListItemEdit />} />
          <Route path="/lists/:listId/edit" element={<ListEdit />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

const mockList = {
  id: 'list1',
  name: 'קניות',
  workspaceId: 'ws1',
  iconId: null,
  imageUrl: null,
  sortOrder: 0,
  categoryIds: [] as string[],
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  version: 0,
}

const mockItems = [
  {
    id: 'item1',
    listId: 'list1',
    productId: 'p1',
    customNameHe: null,
    displayName: 'חלב',
    categoryId: 'c1',
    categoryNameHe: 'מוצרי חלב',
    categoryIconId: 'dairy',
    iconId: null,
    quantity: 2,
    unit: 'ליטר',
    note: null,
    crossedOff: false,
    itemImageUrl: null,
    productImageUrl: null,
    sortOrder: 0,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    version: 0,
  },
  {
    id: 'item2',
    listId: 'list1',
    productId: 'p2',
    customNameHe: null,
    displayName: 'לחם',
    categoryId: 'c2',
    categoryNameHe: 'מאפים',
    categoryIconId: 'bakery',
    iconId: null,
    quantity: 1,
    unit: 'יחידה',
    note: 'מחיטה מלאה',
    crossedOff: false,
    itemImageUrl: null,
    productImageUrl: null,
    sortOrder: 1,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    version: 0,
  },
]

describe('ListDetail', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
    queryClient.clear()
    localStorage.clear()
    useAuthStore.getState().setAuth({
      token: 'test-token',
      userId: 'u1',
      email: 'test@test.com',
      phone: null,
      displayName: 'Test',
      profileImageUrl: null,
      locale: 'he',
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch() {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/lists/list1/items')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockItems),
        })
      }
      if (url.includes('/api/lists/list1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockList),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
    })
  }

  it('renders view mode toggle when items exist', async () => {
    mockFetch()
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /תצוגת רשימה/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /תצוגת כרטיסיות/i })).toBeInTheDocument()
  })

  it('defaults to list view and switches to grid view on toggle', async () => {
    mockFetch()
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })

    const listBtn = screen.getByRole('button', { name: /תצוגת רשימה/i })
    const gridBtn = screen.getByRole('button', { name: /תצוגת כרטיסיות/i })

    // Default: list mode is active
    expect(listBtn).toHaveAttribute('aria-pressed', 'true')
    expect(gridBtn).toHaveAttribute('aria-pressed', 'false')

    // Items and their details are visible in list view
    expect(screen.getByText('חלב')).toBeInTheDocument()
    expect(screen.getByText('לחם')).toBeInTheDocument()
    expect(screen.getByText(/מחיטה מלאה/)).toBeInTheDocument()

    // Switch to grid
    fireEvent.click(gridBtn)
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true')
    expect(listBtn).toHaveAttribute('aria-pressed', 'false')

    // Items still visible in grid view
    expect(screen.getByText('חלב')).toBeInTheDocument()
    expect(screen.getByText('לחם')).toBeInTheDocument()
  })

  it('persists view mode preference in localStorage', async () => {
    localStorage.setItem('listyyy-view-mode:list-list1', 'grid')
    mockFetch()
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })

    const gridBtn = screen.getByRole('button', { name: /תצוגת כרטיסיות/i })
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true')
  })

  describe('auto-scroll and highlight', () => {
    const mockCategoriesForHighlight = [
      { id: 'c1', nameHe: 'מוצרי חלב', iconId: 'dairy', imageUrl: null, sortOrder: 0, workspaceId: 'ws1', version: 1 },
      { id: 'c2', nameHe: 'מאפים', iconId: 'bakery', imageUrl: null, sortOrder: 1, workspaceId: 'ws1', version: 1 },
    ]

    function mockFetchWithCategoriesForHighlight() {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockCategoriesForHighlight) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
    }

    it('when navigating with highlightCategoryId and highlightItemId in location state, expands and highlights that category and item', async () => {
      mockFetchWithCategoriesForHighlight()
      render(
        <Wrapper
          initialEntries={[
            { pathname: '/lists/list1', state: { highlightCategoryId: 'c1', highlightItemId: 'item1' } },
          ]}
        >
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      await waitFor(() => {
        const categoryHeader = screen.getByText('מוצרי חלב').closest('div')
        expect(categoryHeader).toHaveStyle({ background: '#e8f5e9' })
      })
      // Item row is the outer div with background; "חלב" is inside nested divs
      const itemRow = screen.getByText('חלב').closest('div')!.parentElement!.parentElement!
      expect(itemRow).toHaveStyle({ background: '#e8f5e9' })
    })

    it('clicking category expand/collapse highlights the category header', async () => {
      mockFetchWithCategoriesForHighlight()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      const toggleBtns = screen.getAllByRole('button', {
        name: /פתח קטגוריה מוצרי חלב|סגור קטגוריה מוצרי חלב/,
      })
      fireEvent.click(toggleBtns[0])
      await waitFor(() => {
        const categoryHeader = screen.getByText('מוצרי חלב').closest('div')
        expect(categoryHeader).toHaveStyle({ background: '#e8f5e9' })
      })
    })
  })

  it('list header kebab has edit and delete; edit navigates to list edit page', async () => {
    mockFetch()
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })
    const kebab = screen.getByRole('button', { name: /תפריט רשימה/i })
    fireEvent.click(kebab)
    await waitFor(() => {
      expect(screen.getByText('ערוך')).toBeInTheDocument()
      expect(screen.getByText('מחק')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('ערוך'))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ערוך רשימה' })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('שם הרשימה')).toHaveValue('קניות')
    })
  })

  it('opens plaintext dialog with item names in the visible grouped order and copies all text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })
    mockFetch()
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'הצג כטקסט' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'רשימה כטקסט' })).toBeInTheDocument()
    })
    const textarea = screen.getByLabelText('פריטי הרשימה כטקסט') as HTMLTextAreaElement
    expect(textarea).toHaveValue('לחם\nחלב')

    fireEvent.click(screen.getByRole('button', { name: 'העתק הכל' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('לחם\nחלב')
      expect(screen.getByText('הועתק')).toBeInTheDocument()
    })
  })

  it('shows an error message when copying plaintext fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, {
      clipboard: { writeText },
    })
    mockFetch()
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'הצג כטקסט' }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'רשימה כטקסט' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'העתק הכל' }))

    await waitFor(() => {
      expect(screen.getByText('לא ניתן להעתיק')).toBeInTheDocument()
    })
  })

  describe('edit item dialog (single-click)', () => {
    const mockCategories = [
      { id: 'c1', nameHe: 'מוצרי חלב', iconId: 'dairy', imageUrl: null, sortOrder: 0, workspaceId: 'ws1', version: 1 },
      { id: 'c2', nameHe: 'מאפים', iconId: 'bakery', imageUrl: null, sortOrder: 1, workspaceId: 'ws1', version: 1 },
    ]

    function mockFetchWithCategories() {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockCategories) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
    }

    it('opens edit modal when clicking on item name', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
    })

    it('edit modal shows item name field (editable for all items)', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      // Name field shows item name and is editable (including for product-based items)
      const nameInput = screen.getByDisplayValue('חלב') as HTMLInputElement
      expect(nameInput).toBeInTheDocument()
      expect(nameInput.disabled).toBe(false)
    })

    it('edit modal has unit as free text input (not a dropdown)', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      // Unit should be a text input with the current unit value
      const unitInput = screen.getByDisplayValue('ליטר') as HTMLInputElement
      expect(unitInput).toBeInTheDocument()
      expect(unitInput.tagName).toBe('INPUT')
      expect(unitInput.type).toBe('text')
    })

    it('edit modal has quantity controls', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      // Quantity should show current value
      const qtyInput = screen.getByDisplayValue('2') as HTMLInputElement
      expect(qtyInput).toBeInTheDocument()
    })

    it('edit modal has note field', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('לחם')).toBeInTheDocument()
      })
      // Click "לחם" which has a note
      fireEvent.click(screen.getByText('לחם'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      const noteArea = screen.getByDisplayValue('מחיטה מלאה') as HTMLTextAreaElement
      expect(noteArea).toBeInTheDocument()
      expect(noteArea.tagName).toBe('TEXTAREA')
    })

    it('edit modal has category dropdown', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      // Category dropdown should exist with current category selected
      const catSelect = screen.getByRole('combobox', { name: 'קטגוריה' })
      expect(catSelect).toBeInTheDocument()
      expect(catSelect).toHaveTextContent('מוצרי חלב')
    })

    it('sending "ללא קטגוריה" sends clearCategory in PATCH body', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes('/api/lists/list1/items')) {
          if (opts?.method === 'PATCH') {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...mockItems[0], categoryId: null, productId: null, version: 1 }) })
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockCategories) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      const catSelect = screen.getByRole('combobox', { name: 'קטגוריה' })
      fireEvent.click(catSelect)
      fireEvent.click(screen.getByRole('option', { name: 'ללא קטגוריה (אחר)' }))
      fireEvent.click(screen.getByRole('button', { name: 'שמור' }))
      await waitFor(() => {
        const calls = fetchMock.mock.calls as [string, RequestInit | undefined][]
        const patchCall = calls.find(
          ([url, opts]) => opts?.method === 'PATCH' && url.includes('/api/lists/list1/items/') && url.includes('/item1')
        )
        expect(patchCall).toBeDefined()
        const body = JSON.parse(patchCall![1]!.body as string)
        expect(body.clearCategory).toBe(true)
      })
    })

    it('edit screen has image placeholder; clicking it opens image source dialog', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      // Image source dialog is hidden until user clicks the circle
      expect(screen.queryByText('איך להוסיף תמונה?')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('edit-item-image-button'))
      await waitFor(() => {
        expect(screen.getByText('איך להוסיף תמונה?')).toBeInTheDocument()
      })
      // Dialog shows four options: emoji, device, link, search web
      expect(screen.getByTestId('image-source-icon')).toBeInTheDocument()
      expect(screen.getByTestId('image-source-device')).toBeInTheDocument()
      expect(screen.getByTestId('image-source-link')).toBeInTheDocument()
      expect(screen.getByTestId('image-source-web')).toBeInTheDocument()
      // Choosing "Emoji" closes image source dialog and opens emoji selection immediately
      fireEvent.click(screen.getByTestId('image-source-icon'))
      await waitFor(() => {
        expect(screen.queryByText('איך להוסיף תמונה?')).not.toBeInTheDocument()
      })
      await waitFor(() => {
        expect(screen.getByText('בחירת אימוג׳י')).toBeInTheDocument()
      })
    })

    it('syncing item image to product when saving list item with image (so category view shows same image)', async () => {
      const itemWithImage = {
        ...mockItems[0],
        itemImageUrl: 'https://example.com/photo.png',
        productImageUrl: null,
      }
      const mockProductP1 = {
        id: 'p1',
        categoryId: 'c1',
        categoryNameHe: 'מוצרי חלב',
        categoryIconId: 'dairy',
        iconId: null,
        nameHe: 'חלב',
        defaultUnit: 'יחידה',
        imageUrl: null,
        note: null,
        addCount: 0,
        version: 1,
      }
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes('/api/lists/list1/items')) {
          if (opts?.method === 'PATCH') {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...itemWithImage, version: 1 }) })
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([itemWithImage, mockItems[1]]) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockCategories) })
        }
        if (url.includes('/api/products')) {
          if (opts?.method === 'PATCH') {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...mockProductP1, imageUrl: 'https://example.com/photo.png' }) })
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([mockProductP1]) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })
      // Make a change so Save is enabled (save button is disabled when there are no changes)
      fireEvent.change(screen.getByPlaceholderText('אופציונלי'), { target: { value: 'הערה' } })
      fireEvent.click(screen.getByRole('button', { name: 'שמור' }))
      await waitFor(() => {
        const calls = fetchMock.mock.calls as [string, RequestInit | undefined][]
        const productPatch = calls.find(
          ([url, opts]) => opts?.method === 'PATCH' && url.includes('/api/products/') && url.endsWith('/p1')
        )
        expect(productPatch).toBeDefined()
        const body = JSON.parse(productPatch![1]!.body as string)
        expect(body.imageUrl).toBe('https://example.com/photo.png')
        expect(body.iconId).toBe('')
      })
    })

    it('sends latest version even if cache was updated while modal was open', async () => {
      mockFetchWithCategories()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      // Open edit modal for item1 (version 0)
      fireEvent.click(screen.getByText('חלב'))
      await waitFor(() => {
        expect(screen.getByText('עריכת פריט')).toBeInTheDocument()
      })

      // Simulate a background version bump (e.g. crossedOff toggle refetch)
      const updatedItems = mockItems.map((i) =>
        i.id === 'item1' ? { ...i, version: 5 } : i
      )
      await act(async () => {
        queryClient.setQueryData(['listItems', 'list1'], updatedItems)
        // Flush microtasks so React Query notifies subscribers
        await new Promise((r) => setTimeout(r, 0))
      })
      // Extra render cycle for the useEffect -> setEditItem chain
      await act(async () => {})

      // Now set up fetch mock to capture the PATCH call
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ...updatedItems[0], version: 6 }),
          })
        }
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(updatedItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockCategories) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })

      // Change note and submit the edit form
      const noteArea = screen.getByPlaceholderText('אופציונלי') as HTMLTextAreaElement
      await act(async () => {
        fireEvent.change(noteArea, { target: { value: 'הערה חדשה' } })
      })
      await act(async () => {
        fireEvent.submit(noteArea.closest('form')!)
        await new Promise((r) => setTimeout(r, 0))
      })

      await waitFor(() => {
        const calls = fetchMock.mock.calls as [string, RequestInit | undefined][]
        const patchCall = calls.find(
          ([url, opts]) => opts?.method === 'PATCH' && url.includes('/items/')
        )
        expect(patchCall).toBeDefined()
        const body = JSON.parse(patchCall![1]!.body as string)
        // Should use the updated version (5), not the original (0)
        expect(body.version).toBe(5)
      })
    })
  })

  describe('optimistic crossedOff toggle', () => {
    it('updates checkbox immediately without waiting for server response', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      // Set up a PATCH that never resolves (simulates slow server)
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      let resolvePatch: ((v: unknown) => void) | undefined
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH') {
          return new Promise((resolve) => { resolvePatch = resolve })
        }
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })

      const checkboxes = screen.getAllByRole('checkbox', { name: /סימן/i })
      expect(checkboxes[0]).not.toBeChecked()

      fireEvent.click(checkboxes[0])

      // Optimistic update: checked section appears and "חלב" moves there (still visible on page)
      await waitFor(() => {
        expect(screen.getByText('פריטים מסומנים')).toBeInTheDocument()
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      expect(resolvePatch).toBeDefined()

      // Resolve the PATCH to avoid dangling promises
      await act(async () => {
        resolvePatch!({ ok: true, status: 200, json: () => Promise.resolve({ ...mockItems[0], crossedOff: true, version: 1 }) })
      })
    })

    it('rolls back checkbox on server error', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      let rejectPatch: ((v: unknown) => void) | undefined
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PATCH') {
          return new Promise((_resolve, reject) => { rejectPatch = reject })
        }
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })

      const checkboxes = screen.getAllByRole('checkbox', { name: /סימן/i })
      expect(checkboxes[0]).not.toBeChecked()

      fireEvent.click(checkboxes[0])

      // Optimistic: checked section appears with "חלב"
      await waitFor(() => {
        expect(screen.getByText('פריטים מסומנים')).toBeInTheDocument()
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      // Now reject the PATCH to trigger rollback
      await act(async () => {
        rejectPatch!(new Error('Server error'))
      })

      // After error settles, roll back: no checked items so "פריטים מסומנים" hidden; "חלב" back in category
      await waitFor(() => {
        expect(screen.queryByText('פריטים מסומנים')).not.toBeInTheDocument()
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
    })
  })

  describe('trash icon on items', () => {
    it('shows trash icon buttons instead of kebab menus', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      const deleteButtons = screen.getAllByRole('button', { name: /הסר פריט/i })
      expect(deleteButtons.length).toBe(2)
      // Each delete button should contain an SVG (TrashIcon)
      deleteButtons.forEach((btn) => {
        expect(btn.querySelector('svg')).toBeTruthy()
      })
      // No kebab menus should exist on items
      expect(screen.queryByRole('button', { name: /תפריט פריט/i })).not.toBeInTheDocument()
    })
  })

  describe('hide crossed-off items toggle', () => {
    const mockItemsWithCrossedOff = [
      {
        id: 'item1',
        listId: 'list1',
        productId: 'p1',
        customNameHe: null,
        displayName: 'חלב',
        categoryId: 'c1',
        categoryNameHe: 'מוצרי חלב',
        categoryIconId: 'dairy',
        iconId: null,
        quantity: 2,
        unit: 'ליטר',
        note: null,
        crossedOff: false,
        itemImageUrl: null,
        productImageUrl: null,
        sortOrder: 0,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
        version: 0,
      },
      {
        id: 'item2',
        listId: 'list1',
        productId: 'p2',
        customNameHe: null,
        displayName: 'לחם',
        categoryId: 'c2',
        categoryNameHe: 'מאפים',
        categoryIconId: 'bakery',
        iconId: null,
        quantity: 1,
        unit: 'יחידה',
        note: 'מחיטה מלאה',
        crossedOff: true,
        itemImageUrl: null,
        productImageUrl: null,
        sortOrder: 1,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
        version: 0,
      },
      {
        id: 'item3',
        listId: 'list1',
        productId: 'p3',
        customNameHe: null,
        displayName: 'גבינה',
        categoryId: 'c1',
        categoryNameHe: 'מוצרי חלב',
        categoryIconId: 'dairy',
        iconId: null,
        quantity: 1,
        unit: 'יחידה',
        note: null,
        crossedOff: true,
        itemImageUrl: null,
        productImageUrl: null,
        sortOrder: 2,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
        version: 0,
      },
    ]

    function mockFetchCrossedOff(itemsOverride = mockItemsWithCrossedOff) {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(itemsOverride) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
    }

    it('does not show eye toggle when no items are crossed off', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: /הסתר פריטים מסומנים/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /הצג פריטים מסומנים/i })).not.toBeInTheDocument()
    })

    it('shows eye toggle when at least one item is crossed off', async () => {
      mockFetchCrossedOff()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /הסתר פריטים מסומנים/i })).toBeInTheDocument()
    })

    it('hides crossed-off items when eye toggle is clicked', async () => {
      mockFetchCrossedOff()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      // All items visible initially
      expect(screen.getByText('חלב')).toBeInTheDocument()
      expect(screen.getByText('לחם')).toBeInTheDocument()
      expect(screen.getByText('גבינה')).toBeInTheDocument()

      // Click eye toggle to hide crossed-off items
      fireEvent.click(screen.getByRole('button', { name: /הסתר פריטים מסומנים/i }))

      // Crossed-off items should be hidden
      expect(screen.getByText('חלב')).toBeInTheDocument()
      expect(screen.queryByText('לחם')).not.toBeInTheDocument()
      expect(screen.queryByText('גבינה')).not.toBeInTheDocument()
    })

    it('shows crossed-off items again when toggled back', async () => {
      mockFetchCrossedOff()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      // Hide crossed-off items
      fireEvent.click(screen.getByRole('button', { name: /הסתר פריטים מסומנים/i }))
      expect(screen.queryByText('לחם')).not.toBeInTheDocument()

      // Toggle back to show them
      fireEvent.click(screen.getByRole('button', { name: /הצג פריטים מסומנים/i }))
      expect(screen.getByText('לחם')).toBeInTheDocument()
      expect(screen.getByText('גבינה')).toBeInTheDocument()
    })

    it('hides entire category section when all its items are crossed off', async () => {
      mockFetchCrossedOff()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      // Unchecked items in categories; "מאפים" has only checked "לחם" so no category header for it
      expect(screen.getByText(/מוצרי חלב/)).toBeInTheDocument()
      expect(screen.getByText('פריטים מסומנים')).toBeInTheDocument()

      // Hide crossed-off items (hides the checked section)
      fireEvent.click(screen.getByRole('button', { name: /הסתר פריטים מסומנים/i }))

      // "מוצרי חלב" category should still show (has non-crossed-off "חלב")
      expect(screen.getByText(/מוצרי חלב/)).toBeInTheDocument()
      // Checked section is hidden when toggle is on
      expect(screen.queryByText('פריטים מסומנים')).not.toBeInTheDocument()
    })

    it('shows checked items in a separate section below unchecked items', async () => {
      mockFetchCrossedOff()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      // Unchecked "חלב" appears in its category (מוצרי חלב)
      expect(screen.getByText(/מוצרי חלב/)).toBeInTheDocument()
      expect(screen.getByText('חלב')).toBeInTheDocument()

      // Checked items appear in a distinct "פריטים מסומנים" section below
      expect(screen.getByText('פריטים מסומנים')).toBeInTheDocument()
      expect(screen.getByText('לחם')).toBeInTheDocument()
      expect(screen.getByText('גבינה')).toBeInTheDocument()
    })

    it('shows delete marked button when there are crossed-off items and opens confirmation on click', async () => {
      mockFetchCrossedOff()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      const deleteMarkedBtn = screen.getByRole('button', { name: /מחק את כל הפריטים המסומנים/i })
      expect(deleteMarkedBtn).toBeInTheDocument()
      fireEvent.click(deleteMarkedBtn)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'מחיקת פריטים מסומנים' })).toBeInTheDocument()
      })
      expect(screen.getByText(/למחוק את כל 2 הפריטים המסומנים/)).toBeInTheDocument()
      expect(screen.getByText('כן, מחק')).toBeInTheDocument()
      expect(screen.getByText('לא')).toBeInTheDocument()
    })

    it('deletes all marked items when confirming', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'DELETE' && url.includes('/api/lists/list1/items/')) {
          return Promise.resolve({ ok: true, status: 204 })
        }
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItemsWithCrossedOff) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: /מחק את כל הפריטים המסומנים/i }))
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'מחיקת פריטים מסומנים' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('כן, מחק'))
      await waitFor(() => {
        const deleteCalls = (fetchMock.mock.calls as Array<[string, RequestInit?]>).filter(
          (call) => call[1]?.method === 'DELETE' && call[0].includes('/api/lists/list1/items/')
        )
        expect(deleteCalls.length).toBe(2)
        const urls = deleteCalls.map((c) => c[0])
        expect(urls.some((u) => u.includes('item2'))).toBe(true)
        expect(urls.some((u) => u.includes('item3'))).toBe(true)
      })
    })
  })

  describe.skip('quick-add dialog – unit & amount (modal removed: add is inline, edit on item)', () => {
    async function openQuickAdd() {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('הוסף פריט'))
      await waitFor(() => {
        expect(screen.getByText('הוסף פריט לרשימה')).toBeInTheDocument()
      })
    }

    it('defaults unit to ללא and hides amount field', async () => {
      await openQuickAdd()

      const unitSelect = screen.getByLabelText('יחידה') as HTMLSelectElement
      expect(unitSelect.value).toBe('')
      expect(unitSelect).toHaveDisplayValue('ללא')

      expect(screen.queryByLabelText('כמות')).not.toBeInTheDocument()
    })

    it('shows amount stepper when a unit is selected', async () => {
      await openQuickAdd()

      const unitSelect = screen.getByLabelText('יחידה')
      fireEvent.change(unitSelect, { target: { value: 'יחידה' } })

      expect(screen.getByLabelText('כמות')).toBeInTheDocument()
      expect(screen.getByText('−')).toBeInTheDocument()
      expect(screen.getByText('+')).toBeInTheDocument()

      const qtyInput = screen.getByLabelText('כמות') as HTMLInputElement
      expect(qtyInput.value).toBe('1')
    })

    it('hides amount stepper when unit is switched back to ללא', async () => {
      await openQuickAdd()

      const unitSelect = screen.getByLabelText('יחידה')
      fireEvent.change(unitSelect, { target: { value: 'גרם' } })
      expect(screen.getByLabelText('כמות')).toBeInTheDocument()

      fireEvent.change(unitSelect, { target: { value: '' } })
      expect(screen.queryByLabelText('כמות')).not.toBeInTheDocument()
    })

    it('increment button increases quantity', async () => {
      await openQuickAdd()

      fireEvent.change(screen.getByLabelText('יחידה'), { target: { value: 'יחידה' } })
      const qtyInput = screen.getByLabelText('כמות') as HTMLInputElement
      expect(qtyInput.value).toBe('1')

      fireEvent.click(screen.getByText('+'))
      expect(qtyInput.value).toBe('2')

      fireEvent.click(screen.getByText('+'))
      expect(qtyInput.value).toBe('3')
    })

    it('decrement button decreases quantity but not below 1', async () => {
      await openQuickAdd()

      fireEvent.change(screen.getByLabelText('יחידה'), { target: { value: 'חבילה' } })
      const qtyInput = screen.getByLabelText('כמות') as HTMLInputElement

      fireEvent.click(screen.getByText('+'))
      fireEvent.click(screen.getByText('+'))
      expect(qtyInput.value).toBe('3')

      fireEvent.click(screen.getByText('−'))
      expect(qtyInput.value).toBe('2')

      fireEvent.click(screen.getByText('−'))
      expect(qtyInput.value).toBe('1')

      // Should not go below 1
      fireEvent.click(screen.getByText('−'))
      expect(qtyInput.value).toBe('1')
    })

    it('allows typing a quantity directly', async () => {
      await openQuickAdd()

      fireEvent.change(screen.getByLabelText('יחידה'), { target: { value: 'ק"ג' } })
      const qtyInput = screen.getByLabelText('כמות') as HTMLInputElement

      fireEvent.change(qtyInput, { target: { value: '2.5' } })
      expect(qtyInput.value).toBe('2.5')
    })

    it('resets invalid quantity to 1 on blur', async () => {
      await openQuickAdd()

      fireEvent.change(screen.getByLabelText('יחידה'), { target: { value: 'ליטר' } })
      const qtyInput = screen.getByLabelText('כמות') as HTMLInputElement

      fireEvent.change(qtyInput, { target: { value: '' } })
      fireEvent.blur(qtyInput)
      expect(qtyInput.value).toBe('1')

      fireEvent.change(qtyInput, { target: { value: 'abc' } })
      fireEvent.blur(qtyInput)
      expect(qtyInput.value).toBe('1')
    })

    it('submits without quantity/unit when ללא is selected', async () => {
      await openQuickAdd()

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes('/api/lists/list1/items') && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'new-item', displayName: 'test' }),
          })
        }
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })

      // Unit is already ללא by default; fill the name and submit
      const nameInput = screen.getByPlaceholderText('שם פריט')
      fireEvent.change(nameInput, { target: { value: 'פריט חדש' } })
      fireEvent.submit(nameInput.closest('form')!)

      await waitFor(() => {
        const postCall = (fetchMock.mock.calls as [string, RequestInit | undefined][]).find(
          ([url, opts]) =>
            url.includes('/api/lists/list1/items') && opts?.method === 'POST'
        )
        expect(postCall).toBeDefined()
        const body = JSON.parse(postCall![1]!.body as string)
        expect(body.customNameHe).toBe('פריט חדש')
        expect(body.quantity).toBeUndefined()
        expect(body.unit).toBeUndefined()
      })
    })

    it('submits with quantity and unit when a unit is selected', async () => {
      await openQuickAdd()

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes('/api/lists/list1/items') && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'new-item', displayName: 'test' }),
          })
        }
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })

      // Select a unit and set quantity
      fireEvent.change(screen.getByLabelText('יחידה'), { target: { value: 'ק"ג' } })
      const qtyInput = screen.getByLabelText('כמות') as HTMLInputElement
      fireEvent.change(qtyInput, { target: { value: '3' } })

      const nameInput = screen.getByPlaceholderText('שם פריט')
      fireEvent.change(nameInput, { target: { value: 'עגבניות' } })
      fireEvent.submit(nameInput.closest('form')!)

      await waitFor(() => {
        const postCall = (fetchMock.mock.calls as [string, RequestInit | undefined][]).find(
          ([url, opts]) =>
            url.includes('/api/lists/list1/items') && opts?.method === 'POST'
        )
        expect(postCall).toBeDefined()
        const body = JSON.parse(postCall![1]!.body as string)
        expect(body.customNameHe).toBe('עגבניות')
        expect(body.quantity).toBe(3)
        expect(body.unit).toBe('ק"ג')
      })
    })
  })

  describe('search within list', () => {
    it('shows search input when items exist', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText('הוסף / חפש פריט')).toBeInTheDocument()
    })

    it('shows add/search input when list is empty', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('הרשימה ריקה — הוסיפו פריטים או חפשו')).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText('הוסף / חפש פריט')).toBeInTheDocument()
    })

    it('filters items by display name', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      expect(screen.getByText('לחם')).toBeInTheDocument()

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'חלב' } })

      expect(screen.getAllByText('חלב').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('לחם')).not.toBeInTheDocument()
    })

    it('filters items by note', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'מחיטה' } })

      expect(screen.getAllByText('לחם').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('חלב')).not.toBeInTheDocument()
    })

    it('shows matching list items in search dropdown with "already in list" indicator', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'חלב' } })

      await waitFor(() => {
        const alreadyInListLabels = screen.getAllByText('כבר ברשימה')
        expect(alreadyInListLabels.length).toBeGreaterThanOrEqual(1)
      })
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('does not show category product in dropdown when already on list', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      const productsWithChalav = [
        { id: 'p1', nameHe: 'חלב', defaultUnit: 'ליטר', categoryId: 'c1', categoryNameHe: 'מוצרי חלב', categoryIconId: 'dairy', iconId: null, imageUrl: null, note: null, addCount: 5, version: 1 },
        { id: 'p2', nameHe: 'חלב סויה', defaultUnit: 'ליטר', categoryId: 'c2', categoryNameHe: 'טבעוני', categoryIconId: null, iconId: null, imageUrl: null, note: null, addCount: 1, version: 1 },
      ]
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(productsWithChalav) })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'חלב' } })

      await waitFor(() => {
        const listbox = screen.getByRole('listbox')
        expect(listbox).toBeInTheDocument()
        // List has חלב (p1); category also has חלב (p1). We must not show p1 as addable — only one "חלב" row (already in list).
        const chalavExact = screen.getAllByText('חלב', { exact: true })
        const inListbox = chalavExact.filter((el) => listbox.contains(el))
        expect(inListbox.length).toBe(1)
      })
    })

    it('shows no-results message when nothing matches', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'שוקולד' } })

      expect(screen.queryByText('חלב')).not.toBeInTheDocument()
      expect(screen.queryByText('לחם')).not.toBeInTheDocument()
      expect(screen.getByText('לא נמצאו פריטים תואמים')).toBeInTheDocument()
    })

    it('clears search and restores all items when clear button is clicked', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'חלב' } })
      expect(screen.queryByText('לחם')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /נקה/i }))

      expect(screen.getByText('חלב')).toBeInTheDocument()
      expect(screen.getByText('לחם')).toBeInTheDocument()
      expect((searchInput as HTMLInputElement).value).toBe('')
    })

    it('hides category header when all its items are filtered out', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      expect(screen.getByText(/מוצרי חלב/)).toBeInTheDocument()
      expect(screen.getByText(/מאפים/)).toBeInTheDocument()

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'חלב' } })

      expect(screen.getAllByText('מוצרי חלב').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('מאפים')).not.toBeInTheDocument()
    })

    it('search is case-insensitive', async () => {
      mockFetch()
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      fireEvent.change(searchInput, { target: { value: 'מחיטה מלאה' } })

      expect(screen.getAllByText('לחם').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('חלב')).not.toBeInTheDocument()
    })
  })

  describe.skip('quick-add dialog – autocomplete (modal removed: autocomplete is in add/search box)', () => {
    const mockProducts = [
      { id: 'p1', nameHe: 'חלב', defaultUnit: 'ליטר', categoryId: 'c1', categoryNameHe: 'מוצרי חלב', categoryIconId: 'dairy', iconId: null, imageUrl: null, note: null, addCount: 5, version: 1 },
      { id: 'p2', nameHe: 'חלב סויה', defaultUnit: 'ליטר', categoryId: 'c2', categoryNameHe: 'טבעוני', categoryIconId: null, iconId: null, imageUrl: null, note: null, addCount: 1, version: 1 },
      { id: 'p3', nameHe: 'לחם', defaultUnit: 'יחידה', categoryId: 'c3', categoryNameHe: 'מאפים', categoryIconId: 'bakery', iconId: null, imageUrl: null, note: null, addCount: 10, version: 1 },
    ]

    const mockCats = [
      { id: 'c1', nameHe: 'מוצרי חלב', iconId: 'dairy', imageUrl: null, sortOrder: 0, workspaceId: 'ws1', version: 1 },
      { id: 'c2', nameHe: 'טבעוני', iconId: null, imageUrl: null, sortOrder: 1, workspaceId: 'ws1', version: 1 },
      { id: 'c3', nameHe: 'מאפים', iconId: 'bakery', imageUrl: null, sortOrder: 2, workspaceId: 'ws1', version: 1 },
    ]

    function mockFetchWithProducts() {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockList) })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockCats) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockProducts) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
    }

    async function openQuickAddWithProducts() {
      mockFetchWithProducts()
      // Pre-seed products into React Query cache so autocomplete has data immediately
      queryClient.setQueryData(['products'], mockProducts)
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('הוסף פריט'))
      await waitFor(() => {
        expect(screen.getByText('הוסף פריט לרשימה')).toBeInTheDocument()
      })
    }

    it('shows autocomplete suggestions when typing 2+ characters', async () => {
      await openQuickAddWithProducts()
      const nameInput = screen.getByPlaceholderText('שם פריט')
      fireEvent.change(nameInput, { target: { value: 'סוי' } })

      // "חלב סויה" should appear in the autocomplete dropdown
      expect(screen.getByText('חלב סויה')).toBeInTheDocument()
      // "טבעוני" appears both in the dropdown AND category select; verify at least 2 instances
      expect(screen.getAllByText('טבעוני').length).toBeGreaterThanOrEqual(2)
    })

    it('does not show autocomplete with only 1 character', async () => {
      await openQuickAddWithProducts()
      const nameInput = screen.getByPlaceholderText('שם פריט')
      fireEvent.change(nameInput, { target: { value: 'ס' } })

      // No suggestion dropdown should appear
      expect(screen.queryByText('חלב סויה')).not.toBeInTheDocument()
    })

    it('auto-fills category when selecting a suggestion', async () => {
      await openQuickAddWithProducts()
      const nameInput = screen.getByPlaceholderText('שם פריט')

      // Verify category starts unselected (placeholder shown)
      const catSelect = screen.getByRole('combobox', { name: 'קטגוריה' })
      expect(catSelect).toHaveTextContent('ללא קטגוריה (אחר)')

      fireEvent.change(nameInput, { target: { value: 'סוי' } })
      expect(screen.getByText('חלב סויה')).toBeInTheDocument()

      // Click on "חלב סויה" suggestion (product in category c2 = טבעוני)
      fireEvent.mouseDown(screen.getByText('חלב סויה'))

      // Category dropdown should now show the product's category
      await waitFor(() => {
        expect(catSelect).toHaveTextContent('טבעוני')
      })
    })

    it('does not show non-matching products in autocomplete', async () => {
      await openQuickAddWithProducts()
      const nameInput = screen.getByPlaceholderText('שם פריט')
      fireEvent.change(nameInput, { target: { value: 'סוי' } })

      // Should show "חלב סויה" (contains "סוי")
      expect(screen.getByText('חלב סויה')).toBeInTheDocument()
      // "לחם" exists in the background items list but should NOT appear in the dropdown;
      // verify only 1 instance (the list item), not 2 (which would mean it's also in autocomplete)
      expect(screen.getAllByText('לחם').length).toBe(1)
    })
  })

  describe('search add-suggestion dropdown', () => {
    function renderWithData() {
      mockFetch()
      queryClient.setQueryData(['list', 'list1'], mockList)
      queryClient.setQueryData(['listItems', 'list1'], mockItems)
      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )
    }

    it('shows add suggestion after 500ms when no exact match', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWithData()
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'שוקולד' } })
      })

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

      await act(async () => { vi.advanceTimersByTime(500) })

      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getByText(/הוסף "שוקולד" לרשימה/)).toBeInTheDocument()

      vi.useRealTimers()
    })

    it('does not show add suggestion when there is an exact match', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWithData()
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'חלב' } })
      })

      await act(async () => { vi.advanceTimersByTime(500) })

      // Dropdown may show "already in list" for the exact match, but we must not show "add as custom"
      expect(screen.queryByText(/הוסף "חלב" לרשימה/)).not.toBeInTheDocument()

      vi.useRealTimers()
    })

    it('adds item immediately when clicking the add suggestion and clears search', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWithData()
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'שוקולד' } })
      })
      await act(async () => { vi.advanceTimersByTime(500) })

      const addBtn = screen.getByRole('option')
      await act(async () => {
        fireEvent.mouseDown(addBtn)
      })

      vi.useRealTimers()

      // No dialog: item is added immediately. Search should be cleared.
      expect((searchInput as HTMLInputElement).value).toBe('')
    })

    it('hides suggestion when search is cleared', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWithData()
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'שוקולד' } })
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /נקה/i }))
      })

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

      vi.useRealTimers()
    })

    it('resets debounce on subsequent keystrokes', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      renderWithData()
      await waitFor(() => {
        expect(screen.getByText('חלב')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('הוסף / חפש פריט')
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'שו' } })
      })
      await act(async () => { vi.advanceTimersByTime(300) })

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'שוקו' } })
      })
      await act(async () => { vi.advanceTimersByTime(300) })

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

      await act(async () => { vi.advanceTimersByTime(200) })
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      vi.useRealTimers()
    })
  })

  describe('search autocomplete scoped to attached categories', () => {
    const scopedProducts = [
      { id: 'p-dairy', categoryId: 'c1', categoryNameHe: 'מוצרי חלב', categoryIconId: 'dairy', nameHe: 'חלב סויה', defaultUnit: 'ליטר', imageUrl: null, iconId: null, note: null, addCount: 0, version: 0 },
      { id: 'p-vegan', categoryId: 'c2', categoryNameHe: 'טבעוני', categoryIconId: null, nameHe: 'חלב שקדים', defaultUnit: 'ליטר', imageUrl: null, iconId: null, note: null, addCount: 0, version: 0 },
    ]

    it('suggests only products from attached categories', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ...mockList, categoryIds: ['c1'], version: 1 }),
          })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(scopedProducts) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })

      queryClient.setQueryData(['list', 'list1'], { ...mockList, categoryIds: ['c1'], version: 1 })
      queryClient.setQueryData(['listItems', 'list1'], [])
      queryClient.setQueryData(['products'], scopedProducts)

      render(
        <Wrapper>
          <ListDetail />
        </Wrapper>
      )

      const searchInput = await screen.findByPlaceholderText('הוסף / חפש פריט')
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'חלב' } })
      })

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })
      expect(screen.getByText('חלב סויה')).toBeInTheDocument()
      expect(screen.queryByText('חלב שקדים')).not.toBeInTheDocument()
    })
  })

  describe('attached categories – empty-state CTA and add-from-categories button', () => {
    const workspaceCategories = [
      { id: 'c1', nameHe: 'מוצרי חלב', iconId: 'dairy', imageUrl: null, sortOrder: 0, workspaceId: 'ws1', version: 1 },
      { id: 'c2', nameHe: 'מאפים', iconId: 'bakery', imageUrl: null, sortOrder: 1, workspaceId: 'ws1', version: 1 },
    ]
    const workspaceProducts = [
      { id: 'p1', categoryId: 'c1', categoryNameHe: 'מוצרי חלב', categoryIconId: 'dairy', nameHe: 'יוגורט', defaultUnit: 'יחידה', imageUrl: null, iconId: null, note: null, addCount: 0, version: 0 },
    ]

    function mockEmptyListWithCategories(listOverride: Record<string, unknown> = {}) {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes('/api/lists/list1/items')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        }
        if (url.includes('/api/lists/list1') && (opts?.method === 'PUT' || opts?.method === 'PATCH')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ...mockList, ...listOverride, categoryIds: ['c1', 'c2'], version: 1 }),
          })
        }
        if (url.includes('/api/lists/list1')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ...mockList, ...listOverride }),
          })
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(workspaceCategories) })
        }
        if (url.includes('/api/products')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(workspaceProducts) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      })
    }

    it('shows empty-state attach CTA when list has no items and no attached categories', async () => {
      mockEmptyListWithCategories()
      render(<Wrapper><ListDetail /></Wrapper>)
      await waitFor(() => {
        expect(screen.getByTestId('empty-state-attach-categories')).toBeInTheDocument()
      })
      expect(screen.getByText(/צרפו קטגוריות לרשימה זו/)).toBeInTheDocument()
    })

    it('does not show empty-state attach CTA when list already has attached categories', async () => {
      mockEmptyListWithCategories({ categoryIds: ['c1'] })
      render(<Wrapper><ListDetail /></Wrapper>)
      await waitFor(() => {
        expect(screen.getByPlaceholderText('הוסף / חפש פריט')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('empty-state-attach-categories')).not.toBeInTheDocument()
    })

    it('clicking empty-state CTA opens attach categories dialog and saving PATCHes the list', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      mockEmptyListWithCategories()
      render(<Wrapper><ListDetail /></Wrapper>)
      await waitFor(() => {
        expect(screen.getByTestId('empty-state-attach-categories')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('empty-state-attach-categories'))
      await waitFor(() => {
        expect(screen.getByText('צירוף קטגוריות לרשימה')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('מוצרי חלב'))
      fireEvent.click(screen.getByLabelText('מאפים'))

      fireEvent.click(screen.getByTestId('attach-categories-save'))

      await waitFor(() => {
        const putCall = fetchMock.mock.calls.find(
          ([url, opts]) =>
            typeof url === 'string' &&
            url.includes('/api/lists/list1') &&
            (opts as RequestInit | undefined)?.method === 'PUT'
        )
        expect(putCall).toBeTruthy()
        const body = JSON.parse(((putCall![1] as RequestInit).body as string) || '{}')
        expect(body.categoryIds).toEqual(['c1', 'c2'])
      })
    })

    it('does not show "add from categories" button when no categories are attached', async () => {
      mockEmptyListWithCategories()
      render(<Wrapper><ListDetail /></Wrapper>)
      await waitFor(() => {
        expect(screen.getByPlaceholderText('הוסף / חפש פריט')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('add-from-categories-button')).not.toBeInTheDocument()
    })

    it('shows "add from categories" button when at least one category is attached', async () => {
      mockEmptyListWithCategories({ categoryIds: ['c1'] })
      render(<Wrapper><ListDetail /></Wrapper>)
      await waitFor(() => {
        expect(screen.getByTestId('add-from-categories-button')).toBeInTheDocument()
      })
    })

    it('clicking "add from categories" button opens the product-bank bottom-sheet', async () => {
      mockEmptyListWithCategories({ categoryIds: ['c1'] })
      render(<Wrapper><ListDetail /></Wrapper>)
      await waitFor(() => {
        expect(screen.getByTestId('add-from-categories-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('add-from-categories-button'))

      await waitFor(() => {
        expect(screen.getByTestId('product-bank-sheet')).toBeInTheDocument()
      })
      expect(screen.getByTestId('product-bank-view')).toBeInTheDocument()
    })

    it('closing the product-bank sheet hides it', async () => {
      mockEmptyListWithCategories({ categoryIds: ['c1'] })
      render(<Wrapper><ListDetail /></Wrapper>)
      await waitFor(() => {
        expect(screen.getByTestId('add-from-categories-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('add-from-categories-button'))
      await waitFor(() => {
        expect(screen.getByTestId('product-bank-sheet')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('סגור'))

      await waitFor(() => {
        expect(screen.queryByTestId('product-bank-sheet')).not.toBeInTheDocument()
      })
    })
  })
})

describe('ListDetail – auto-add badge', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
    queryClient.clear()
    localStorage.clear()
    useAuthStore.getState().setAuth({
      token: 'test-token',
      userId: 'u1',
      email: 'test@test.com',
      phone: null,
      displayName: 'Test',
      profileImageUrl: null,
      locale: 'he',
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetchWithAutoAddRules(rules: object[]) {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/auto-add')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(rules),
        })
      }
      if (url.includes('/api/lists/list1/items')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockItems),
        })
      }
      if (url.includes('/api/lists/list1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockList),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
    })
  }

  it('shows a green clock badge with the rule definition for items with a rule', async () => {
    mockFetchWithAutoAddRules([
      {
        id: 'rule1',
        listId: 'list1',
        productId: 'p1',
        customNameHe: null,
        quantity: 2,
        unit: 'ליטר',
        everyN: 1,
        everyUnit: 'WEEKS',
        enabled: true,
        nextRunAt: '2026-10-01T05:00:00Z',
        version: 1,
      },
    ])
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })

    // Only חלב (p1) has a rule; לחם (p2) has none
    const badges = await screen.findAllByTestId('auto-add-badge')
    expect(badges).toHaveLength(1)
    // Indication styling, not a button
    expect(badges[0].tagName).toBe('SPAN')
    expect(badges[0].querySelector('svg')).toHaveAttribute('stroke', '#2e7d32')

    // No native (slow) title tooltip; the custom one appears quickly on hover
    expect(badges[0]).not.toHaveAttribute('title')
    expect(screen.queryByTestId('auto-add-tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(badges[0])
    const tip = await screen.findByTestId('auto-add-tooltip')
    expect(tip).toHaveTextContent('הוספה אוטומטית: 2 × כל 1 שבועות')
    fireEvent.mouseLeave(badges[0])
    await waitFor(() => {
      expect(screen.queryByTestId('auto-add-tooltip')).not.toBeInTheDocument()
    })
  })

  it('shows no badge when no rules exist', async () => {
    mockFetchWithAutoAddRules([])
    render(
      <Wrapper>
        <ListDetail />
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('חלב')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('auto-add-badge')).not.toBeInTheDocument()
  })
})
