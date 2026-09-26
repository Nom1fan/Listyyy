import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ListItemEdit } from './ListItemEdit'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/lists/list1/items/item1/edit']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/lists/:listId/items/:itemId/edit" element={children} />
          <Route path="/lists/:listId" element={<div>list page</div>} />
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
  categoryIds: ['c1'] as string[],
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  version: 3,
}

const mockItem = {
  id: 'item1',
  listId: 'list1',
  productId: null,
  customNameHe: 'פריט מותאם',
  displayName: 'פריט מותאם',
  categoryId: null,
  categoryNameHe: null,
  categoryIconId: null,
  productImageUrl: null,
  itemImageUrl: null,
  iconId: null,
  quantity: 1,
  unit: 'יחידה',
  showQuantityUnit: false,
  note: null,
  crossedOff: false,
  sortOrder: 0,
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  version: 1,
}

const mockCategories = [
  { id: 'c1', nameHe: 'מוצרי חלב', iconId: 'dairy', imageUrl: null, sortOrder: 0, workspaceId: 'ws1', version: 1 },
]

const mockRule = {
  id: 'rule1',
  listId: 'list1',
  productId: null,
  customNameHe: 'פריט מותאם',
  quantity: 3,
  unit: 'יחידה',
  everyN: 2,
  everyUnit: 'WEEKS',
  enabled: true,
  nextRunAt: '2026-10-01T10:00:00Z',
  version: 1,
}

function notFound() {
  return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('{"message":"לא נמצא"}') })
}

function mockFetchWithRule(rule: typeof mockRule | null) {
  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
  fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url !== 'string') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })

    if (url.includes('/auto-add')) {
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...(rule ?? mockRule), id: 'rule1' }) })
      }
      if (rule) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rule) })
      }
      return notFound()
    }
    if (url.includes('/api/lists/list1/items/item1') && opts?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...mockItem, version: 2 }),
      })
    }
    if (url.includes('/api/lists/list1/items')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([mockItem]) })
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
  return fetchMock
}

describe('ListItemEdit – automatic replenishment', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
    queryClient.clear()
    useAuthStore.getState().setAuth({
      token: 'test-token',
      userId: 'u1',
      email: 'a@b.c',
      phone: null,
      displayName: 'Test',
      profileImageUrl: null,
      locale: 'he',
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('creates a rule on save when the toggle is turned on', async () => {
    const fetchMock = mockFetchWithRule(null)

    render(
      <Wrapper>
        <ListItemEdit />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('פריט מותאם')).toBeInTheDocument()
    })

    // Section starts off; save is disabled with no changes
    const toggle = screen.getByTestId('auto-add-toggle') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    expect(screen.getByRole('button', { name: /^שמור$/i })).toBeDisabled()

    fireEvent.click(toggle)
    expect(screen.getByTestId('auto-add-quantity')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('auto-add-quantity'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('auto-add-every'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'יחידת זמן' }))
    await waitFor(() => {
      expect(screen.getByText('חודשים')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('חודשים'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^שמור$/i }))
    })

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/auto-add') &&
          (opts as RequestInit | undefined)?.method === 'PUT'
      )
      expect(putCall).toBeTruthy()
      const body = JSON.parse(((putCall![1] as RequestInit).body as string) || '{}')
      expect(body).toEqual({ quantity: 5, everyN: 2, everyUnit: 'MONTHS', enabled: true })
    })

    await waitFor(() => {
      expect(screen.getByText('list page')).toBeInTheDocument()
    })
  })

  it('loads an existing rule and disables it on toggle-off save', async () => {
    const fetchMock = mockFetchWithRule(mockRule)

    render(
      <Wrapper>
        <ListItemEdit />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('פריט מותאם')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect((screen.getByTestId('auto-add-toggle') as HTMLInputElement).checked).toBe(true)
    })

    expect((screen.getByTestId('auto-add-quantity') as HTMLInputElement).value).toBe('3')
    expect((screen.getByTestId('auto-add-every') as HTMLInputElement).value).toBe('2')
    expect(screen.getByTestId('auto-add-next-run')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('auto-add-toggle'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^שמור$/i }))
    })

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/auto-add') &&
          (opts as RequestInit | undefined)?.method === 'PUT'
      )
      expect(putCall).toBeTruthy()
      const body = JSON.parse(((putCall![1] as RequestInit).body as string) || '{}')
      expect(body.enabled).toBe(false)
    })
  })

  it('blocks save with an error when the auto-add quantity is invalid', async () => {
    const fetchMock = mockFetchWithRule(null)

    render(
      <Wrapper>
        <ListItemEdit />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('פריט מותאם')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('auto-add-toggle'))
    fireEvent.change(screen.getByTestId('auto-add-quantity'), { target: { value: 'abc' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^שמור$/i }))
    })

    await waitFor(() => {
      expect(screen.getByText('כמות להוספה חייבת להיות מספר חיובי')).toBeInTheDocument()
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, opts]) =>
        typeof url === 'string' &&
        url.includes('/auto-add') &&
        (opts as RequestInit | undefined)?.method === 'PUT'
    )
    expect(putCall).toBeUndefined()
  })
})
