import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AutoAddSettings } from './AutoAddSettings'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

const mockProducts = [
  {
    id: 'product1',
    categoryId: 'c1',
    categoryNameHe: 'מכולת',
    categoryIconId: 'groceries',
    iconId: null,
    nameHe: 'אורז',
    defaultUnit: 'קילו',
    imageUrl: null,
    note: null,
    addCount: 0,
    version: 1,
  },
  {
    id: 'product2',
    categoryId: 'c1',
    categoryNameHe: 'מכולת',
    categoryIconId: 'groceries',
    iconId: null,
    nameHe: 'חלב',
    defaultUnit: 'ליטר',
    imageUrl: null,
    note: null,
    addCount: 0,
    version: 1,
  },
]

const mockItems = [
  {
    id: 'item1',
    listId: 'list1',
    productId: 'product1',
    customNameHe: null,
    displayName: 'אורז',
    categoryId: 'c1',
    categoryNameHe: 'מכולת',
    categoryIconId: 'groceries',
    iconId: null,
    quantity: 1,
    unit: 'קילו',
    showQuantityUnit: false,
    note: null,
    crossedOff: false,
    itemImageUrl: null,
    productImageUrl: null,
    sortOrder: 0,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    version: 1,
  },
]

const productRule = {
  id: 'rule1',
  listId: 'list1',
  productId: 'product1',
  customNameHe: null,
  quantity: 2,
  unit: 'קילו',
  everyN: 1,
  everyUnit: 'WEEKS',
  enabled: true,
  nextRunAt: '2026-10-01T10:00:00Z',
  version: 1,
}

const orphanCustomRule = {
  id: 'rule2',
  listId: 'list1',
  productId: null,
  customNameHe: 'פריט שנמחק',
  quantity: 1,
  unit: 'יחידה',
  everyN: 3,
  everyUnit: 'DAYS',
  enabled: true,
  nextRunAt: '2026-10-02T10:00:00Z',
  version: 1,
}

function mockFetch(rules: typeof productRule[] | object[]) {
  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
  fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url !== 'string') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })

    if (url.includes('/auto-add')) {
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...productRule, id: 'rule-new' }) })
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...productRule }) })
      }
      if (opts?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rules) })
    }
    if (url.includes('/api/products')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockProducts) })
    }
    if (url.includes('/api/lists/list1/items')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockItems) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
  })
  return fetchMock
}

describe('AutoAddSettings', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
    queryClient.clear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('lists rules with schedule summaries and flags items missing from the list', async () => {
    mockFetch([productRule, orphanCustomRule])

    render(
      <Wrapper>
        <AutoAddSettings listId="list1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('אורז')).toBeInTheDocument()
    })
    expect(screen.getByText(/2 × כל 1 שבועות/)).toBeInTheDocument()
    expect(screen.getByText('פריט שנמחק')).toBeInTheDocument()
    expect(screen.getByText(/1 × כל 3 ימים/)).toBeInTheDocument()
    expect(screen.getByText(/לא ברשימה/)).toBeInTheDocument()
  })

  it('toggles a rule off', async () => {
    const fetchMock = mockFetch([productRule])

    render(
      <Wrapper>
        <AutoAddSettings listId="list1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('אורז')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'הפעל הוספה אוטומטית עבור אורז' }))
    })

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/auto-add/rule1') &&
          (opts as RequestInit | undefined)?.method === 'PUT'
      )
      expect(putCall).toBeTruthy()
      expect(JSON.parse(((putCall![1] as RequestInit).body as string) || '{}')).toEqual({ enabled: false })
    })
  })

  it('deletes a rule after confirmation', async () => {
    const fetchMock = mockFetch([productRule])

    render(
      <Wrapper>
        <AutoAddSettings listId="list1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('אורז')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'מחק הוספה אוטומטית עבור אורז' }))
    await waitFor(() => {
      expect(screen.getByText(/למחוק את ההוספה האוטומטית/)).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'כן, מחק' }))
    })

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/auto-add/rule1') &&
          (opts as RequestInit | undefined)?.method === 'DELETE'
      )
      expect(deleteCall).toBeTruthy()
    })
  })

  it('creates a rule from product search', async () => {
    const fetchMock = mockFetch([])

    render(
      <Wrapper>
        <AutoAddSettings listId="list1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auto-add-settings-add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('auto-add-settings-add'))
    fireEvent.change(screen.getByTestId('auto-add-settings-search'), { target: { value: 'חל' } })

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'חלב' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('option', { name: 'חלב' }))

    fireEvent.change(screen.getByTestId('auto-add-settings-quantity'), { target: { value: '3' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('auto-add-settings-save'))
    })

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.endsWith('/api/lists/list1/auto-add') &&
          (opts as RequestInit | undefined)?.method === 'POST'
      )
      expect(postCall).toBeTruthy()
      expect(JSON.parse(((postCall![1] as RequestInit).body as string) || '{}')).toEqual({
        productId: 'product2',
        quantity: 3,
        everyN: 1,
        everyUnit: 'WEEKS',
        enabled: true,
      })
    })
  })

  it('edits a rule schedule', async () => {
    const fetchMock = mockFetch([productRule])

    render(
      <Wrapper>
        <AutoAddSettings listId="list1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('אורז')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'ערוך הוספה אוטומטית עבור אורז' }))

    await waitFor(() => {
      expect((screen.getByTestId('auto-add-settings-quantity') as HTMLInputElement).value).toBe('2')
    })
    fireEvent.change(screen.getByTestId('auto-add-settings-every'), { target: { value: '4' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('auto-add-settings-save'))
    })

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/auto-add/rule1') &&
          (opts as RequestInit | undefined)?.method === 'PUT'
      )
      expect(putCall).toBeTruthy()
      const body = JSON.parse(((putCall![1] as RequestInit).body as string) || '{}')
      expect(body).toEqual({ quantity: 2, everyN: 4, everyUnit: 'WEEKS', enabled: true })
    })
  })
})
