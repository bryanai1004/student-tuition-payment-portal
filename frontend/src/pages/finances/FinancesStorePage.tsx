import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage, useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '@/context/AccountContext'
import { IconFeesStore } from '@/components/icons/PortalModuleIcons'
import {
  deleteStoreCartLineApi,
  fetchAccountingQuarters,
  fetchStoreCart,
  fetchStoreCatalog,
  postStoreCartCommitToLedger,
  putStoreCartLine,
  type StoreCartResponse,
  type StoreCatalogItem,
} from '@/lib/api'
import { formatMoney } from '@/lib/formatMoney'
import {
  cartSubtotal,
  storeCartLinesFromResponse,
  updateCartLineQuantity,
  type StoreCartLine,
  writeStoreCart,
} from '@/lib/storeCart'
import { StoreFeeIcon } from '@/lib/storeFeeIcons'

/** 3 rows × 4 columns per catalog page. */
const STORE_PAGE_SIZE = 12

export function FinancesStorePage() {
  const { locale } = useLanguage()
  const t = useStudentPortalT()
  const navigate = useNavigate()
  const { currentStudentId, authToken, isAuthenticated } = useAccount()
  const studentId = currentStudentId?.trim() ?? ''
  const token = authToken?.trim() || undefined
  const [catalog, setCatalog] = useState<StoreCatalogItem[]>([])
  const [cart, setCart] = useState<StoreCartLine[]>([])
  const [term, setTerm] = useState('')
  const [year, setYear] = useState(Number.NaN)
  const [termLabel, setTermLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncingFeeCode, setSyncingFeeCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const applyCartResponse = useCallback(
    (payload: StoreCartResponse) => {
      const lines = storeCartLinesFromResponse(payload.items)
      setCart(lines)
      writeStoreCart(studentId, lines)
    },
    [studentId],
  )

  useEffect(() => {
    if (!isAuthenticated || studentId === '') {
      navigate('/finances/overview', { replace: true })
    }
  }, [isAuthenticated, navigate, studentId])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [catalogRes, quartersRes] = await Promise.all([
          fetchStoreCatalog({ signal: ac.signal, authToken: token, locale }),
          fetchAccountingQuarters(studentId, { signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setCatalog(catalogRes.items)
        setPage(0)
        const newest = quartersRes.quarters[0]
        if (newest == null) {
          throw new Error('No payable term found for your account.')
        }
        setTerm(newest.term)
        setYear(newest.year)
        setTermLabel(newest.label)
        const cartRes = await fetchStoreCart(newest.term, newest.year, {
          signal: ac.signal,
          authToken: token,
        })
        if (!ac.signal.aborted) applyCartResponse(cartRes)
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Store payment failed.')
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [applyCartResponse, locale, studentId, token])

  const totalPages = Math.max(1, Math.ceil(catalog.length / STORE_PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = useMemo(
    () => catalog.slice(safePage * STORE_PAGE_SIZE, (safePage + 1) * STORE_PAGE_SIZE),
    [catalog, safePage],
  )

  const subtotal = useMemo(() => cartSubtotal(cart), [cart])
  const catalogByCode = useMemo(
    () => new Map(catalog.map((item) => [item.code, item])),
    [catalog],
  )
  const cartByCode = useMemo(() => new Map(cart.map((row) => [row.feeCode, row])), [cart])
  const cartItemCount = useMemo(
    () => cart.reduce((sum, row) => sum + row.quantity, 0),
    [cart],
  )

  const lineMeta = (feeCode: string, row?: StoreCartLine) => {
    const catalogItem = catalogByCode.get(feeCode)
    return {
      allowQuantity: catalogItem?.allowQuantity ?? row?.allowQuantity ?? false,
      maxQuantity: catalogItem?.maxQuantity ?? row?.maxQuantity ?? 1,
    }
  }
  const pageIndicator = t('storePageIndicator')
    .replace('{page}', String(safePage + 1))
    .replace('{total}', String(totalPages))

  const syncCartLine = async (feeCode: string, quantity: number) => {
    if (term.trim() === '' || !Number.isFinite(year)) {
      setError(t('noPayableTermFound'))
      return
    }
    setSyncingFeeCode(feeCode)
    setError(null)
    const previousCart = cart
    setCart((current) => {
      const next = updateCartLineQuantity(current, feeCode, quantity)
      writeStoreCart(studentId, next)
      return next
    })
    try {
      const payload = await putStoreCartLine(
        { term, year, feeCode, quantity },
        { authToken: token },
      )
      applyCartResponse(payload)
    } catch (e) {
      setCart(previousCart)
      writeStoreCart(studentId, previousCart)
      setError(e instanceof Error ? e.message : t('storePaymentFailed'))
    } finally {
      setSyncingFeeCode(null)
    }
  }

  const removeLine = async (feeCode: string) => {
    if (term.trim() === '' || !Number.isFinite(year)) {
      setError(t('noPayableTermFound'))
      return
    }
    setSyncingFeeCode(feeCode)
    setError(null)
    const previousCart = cart
    setCart((current) => {
      const next = current.filter((row) => row.feeCode !== feeCode)
      writeStoreCart(studentId, next)
      return next
    })
    try {
      const payload = await deleteStoreCartLineApi(term, year, feeCode, { authToken: token })
      applyCartResponse(payload)
    } catch (e) {
      setCart(previousCart)
      writeStoreCart(studentId, previousCart)
      setError(e instanceof Error ? e.message : t('storePaymentFailed'))
    } finally {
      setSyncingFeeCode(null)
    }
  }

  const handleAdd = (item: StoreCatalogItem) => {
    const existing = cartByCode.get(item.code)
    const nextQty = existing != null ? existing.quantity + 1 : 1
    void syncCartLine(item.code, nextQty)
  }

  const scrollToCart = () => {
    document.getElementById('store-cart-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const updateLineQty = (feeCode: string, nextQty: number) => {
    const qty = Math.trunc(nextQty)
    if (qty <= 0) {
      void removeLine(feeCode)
      return
    }
    void syncCartLine(feeCode, qty)
  }

  const proceedToBill = () => {
    if (term.trim() === '' || !Number.isFinite(year) || cart.length === 0) return
    setSyncingFeeCode('__checkout__')
    setError(null)
    void postStoreCartCommitToLedger(term, year, { authToken: token })
      .then((payload: StoreCartResponse) => {
        applyCartResponse(payload)
        const params = new URLSearchParams()
        params.set('term', term)
        params.set('year', String(year))
        if (termLabel.trim() !== '') params.set('label', termLabel)
        navigate(`/finances/overview?${params.toString()}`, {
          state: { financePaymentRefresh: true },
        })
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t('storePaymentFailed'))
      })
      .finally(() => {
        setSyncingFeeCode(null)
      })
  }

  return (
    <main className="portal-page portal-store-page">
      <header className="portal-store-page__header">
        <h1 className="portal-page-title">{t('storeCatalogHeading')}</h1>
        <button
          type="button"
          className="portal-store-page__cart-trigger"
          onClick={scrollToCart}
        >
          <span className="portal-store-page__cart-trigger-icon" aria-hidden>
            <IconFeesStore width={16} height={16} />
          </span>
          <span>{t('storeViewCart')}</span>
          {cartItemCount > 0 ? (
            <span className="portal-store-page__cart-trigger-count">{cartItemCount}</span>
          ) : null}
        </button>
      </header>

      {loading ? (
        <p className="portal-inline-note" role="status">
          {t('loadingPaymentDetails')}
        </p>
      ) : null}
      {error ? (
        <p className="portal-inline-note" role="alert">
          {error}
        </p>
      ) : null}

      <div className="portal-store-layout">
        <section className="portal-store-catalog" aria-label={t('storeCatalogHeading')}>
          <ul className="portal-store-catalog__grid">
            {pageItems.map((item) => {
              const cartRow = cartByCode.get(item.code)
              const inCart = cartRow != null
              const meta = lineMeta(item.code, cartRow)
              const qty = cartRow?.quantity ?? 1
              const lineBusy = syncingFeeCode === item.code
              return (
                <li key={item.code} className="portal-card portal-store-product">
                  <div className="portal-store-product__body">
                    <div className="portal-store-product__head">
                      <StoreFeeIcon code={item.code} />
                      <h2 className="portal-store-product__title">{item.name}</h2>
                    </div>
                    <p className="portal-store-product__price">{formatMoney(item.unitPriceUsd)}</p>
                    <p className="portal-store-product__desc">{item.description}</p>
                  </div>
                  <div className="portal-store-product__actions">
                  {inCart && meta.allowQuantity ? (
                    <div className="portal-store-product__qty">
                      <span className="portal-store-product__qty-label">{t('storeQuantity')}</span>
                      <div className="portal-store-product__qty-controls">
                        <button
                          type="button"
                          className="portal-store-product__qty-btn"
                          aria-label={`${t('storeQuantity')} −`}
                          disabled={lineBusy || qty <= 1}
                          onClick={() => updateLineQty(item.code, qty - 1)}
                        >
                          −
                        </button>
                        <span className="portal-store-product__qty-value" aria-live="polite">
                          {qty}
                        </span>
                        <button
                          type="button"
                          className="portal-store-product__qty-btn"
                          aria-label={`${t('storeQuantity')} +`}
                          disabled={lineBusy || qty >= meta.maxQuantity}
                          onClick={() => updateLineQty(item.code, qty + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!inCart || !meta.allowQuantity ? (
                  <button
                    type="button"
                    className={[
                      'portal-store-product__add',
                      inCart ? 'portal-store-product__add--in-cart' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={inCart || lineBusy}
                    onClick={() => handleAdd(item)}
                  >
                    {inCart ? t('storeInCart') : t('storeAddToCart')}
                  </button>
                  ) : null}
                  </div>
                </li>
              )
            })}
          </ul>

          {catalog.length > 0 ? (
            <nav className="portal-store-pagination" aria-label={pageIndicator}>
              <p className="portal-store-pagination__meta">{pageIndicator}</p>
              <div className="portal-store-pagination__actions">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  {t('storePagePrev')}
                </button>
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  {t('storePageNext')}
                </button>
              </div>
            </nav>
          ) : null}
        </section>

        <aside className="portal-store-cart" aria-labelledby="store-cart-heading">
          <header className="portal-store-cart__header">
            <h2 id="store-cart-heading" className="portal-store-cart__title">
              {t('storeCartHeading')}
            </h2>
            {cartItemCount > 0 ? (
              <span className="portal-store-cart__header-count">{cartItemCount}</span>
            ) : null}
          </header>

          {cart.length === 0 ? (
            <div className="portal-store-cart__empty">
              <p>{t('storeCartEmpty')}</p>
            </div>
          ) : (
            <div className="portal-store-cart__body">
              <ul className="portal-store-cart__list">
                {cart.map((row) => {
                  const meta = lineMeta(row.feeCode, row)
                  const lineBusy = syncingFeeCode === row.feeCode
                  return (
                  <li key={row.feeCode} className="portal-store-cart__item">
                    <div className="portal-store-cart__item-main">
                      <div className="portal-store-cart__item-top">
                        <span className="portal-store-cart__item-name">{row.name}</span>
                        <span className="portal-store-cart__item-price">
                          {formatMoney(row.unitPriceUsd * row.quantity)}
                        </span>
                      </div>
                      <div className="portal-store-cart__item-bottom">
                        {meta.allowQuantity ? (
                          <div className="portal-store-cart__qty">
                            <span className="portal-store-cart__qty-label">{t('storeQuantity')}</span>
                            <div className="portal-store-product__qty-controls">
                              <button
                                type="button"
                                className="portal-store-product__qty-btn"
                                aria-label={`${t('storeQuantity')} −`}
                                disabled={lineBusy || row.quantity <= 1}
                                onClick={() => updateLineQty(row.feeCode, row.quantity - 1)}
                              >
                                −
                              </button>
                              <span className="portal-store-product__qty-value" aria-live="polite">
                                {row.quantity}
                              </span>
                              <button
                                type="button"
                                className="portal-store-product__qty-btn"
                                aria-label={`${t('storeQuantity')} +`}
                                disabled={lineBusy || row.quantity >= meta.maxQuantity}
                                onClick={() => updateLineQty(row.feeCode, row.quantity + 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="portal-store-cart__qty-fixed">
                            {t('storeQuantity')} 1
                          </span>
                        )}
                        <button
                          type="button"
                          className="portal-store-cart__remove"
                          disabled={lineBusy}
                          onClick={() => void removeLine(row.feeCode)}
                        >
                          {t('storeRemove')}
                        </button>
                      </div>
                    </div>
                  </li>
                  )
                })}
              </ul>
              <div className="portal-store-cart__footer">
                <div className="portal-store-cart__subtotal">
                  <span>{t('storeSubtotal')}</span>
                  <strong>{formatMoney(subtotal)}</strong>
                </div>
                <button
                  type="button"
                  className="portal-store-cart__checkout"
                  disabled={syncingFeeCode != null || cart.length === 0}
                  onClick={proceedToBill}
                >
                  {t('storeProceedToCheckout')}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
