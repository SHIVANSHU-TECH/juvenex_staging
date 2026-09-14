'use client'

/**
 * Google Places address autocomplete (same pattern as NextVial Shipping /
 * IdunRX Checkout2). Loads Maps JS with libraries=places.
 * Prefers NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; falls back to the same client key
 * used by NextVial when the env var is empty.
 */
import { useEffect, useId, useRef } from 'react'

export interface AddressParts {
  address: string
  city: string
  state: string
  zip: string
}

interface GoogleAddressAutocompleteProps {
  label: string
  value: string
  onChange: (value: string) => void
  onPlace: (parts: AddressParts) => void
  error?: string
  required?: boolean
  disabled?: boolean
  autoComplete?: string
  placeholder?: string
}

/** Same Maps/Places key NextVial embeds in Shipping.tsx (browser-restricted). */
const NEXTVIAL_MAPS_KEY = 'AIzaSyDqypMXRxstlMdPZ-LUGWb4w36I0ENsu9U'

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: {
              types?: string[]
              componentRestrictions?: { country: string | string[] }
              fields?: string[]
            }
          ) => {
            addListener: (event: string, handler: () => void) => void
            getPlace: () => {
              formatted_address?: string
              address_components?: Array<{
                long_name: string
                short_name: string
                types: string[]
              }>
            }
          }
        }
        event?: { clearInstanceListeners?: (instance: unknown) => void }
      }
    }
    __jxGoogleMapsPromise?: Promise<void>
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.maps?.places) return Promise.resolve()
  if (window.__jxGoogleMapsPromise) return window.__jxGoogleMapsPromise

  window.__jxGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-jx-google-maps]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')))
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`
    script.async = true
    script.defer = true
    script.dataset.jxGoogleMaps = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google Maps failed to load'))
    document.head.appendChild(script)
  })

  return window.__jxGoogleMapsPromise
}

function parsePlace(place: {
  formatted_address?: string
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
}): AddressParts {
  let city = ''
  let state = ''
  let zip = ''
  let streetNumber = ''
  let route = ''

  for (const component of place.address_components || []) {
    const types = component.types
    if (types.includes('street_number')) streetNumber = component.long_name
    if (types.includes('route')) route = component.long_name
    if (types.includes('locality')) city = component.long_name
    if (types.includes('sublocality_level_1') && !city) city = component.long_name
    if (types.includes('postal_town') && !city) city = component.long_name
    if (types.includes('administrative_area_level_1')) state = component.short_name
    if (types.includes('postal_code')) zip = component.long_name
  }

  const fromComponents = [streetNumber, route].filter(Boolean).join(' ').trim()
  const address =
    fromComponents ||
    (place.formatted_address ? place.formatted_address.split(',')[0]?.trim() || '' : '')

  return { address, city, state, zip }
}

export function GoogleAddressAutocomplete({
  label,
  value,
  onChange,
  onPlace,
  error,
  required,
  disabled,
  autoComplete = 'street-address',
  placeholder = 'Start typing your address',
}: GoogleAddressAutocompleteProps) {
  const id = useId()
  const errorId = `${id}-error`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onPlaceRef = useRef(onPlace)

  useEffect(() => {
    onPlaceRef.current = onPlace
  }, [onPlace])

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || NEXTVIAL_MAPS_KEY

  useEffect(() => {
    if (!apiKey || !inputRef.current) return
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let autocomplete: any = null

    void (async () => {
      try {
        await loadGoogleMaps(apiKey)
      } catch {
        return
      }
      if (cancelled || !inputRef.current || !window.google?.maps?.places) return

      autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['geocode'],
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'address_components'],
      })

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete?.getPlace()
        if (!place) return
        const parts = parsePlace(place)
        onPlaceRef.current(parts)
      })
    })()

    return () => {
      cancelled = true
      try {
        window.google?.maps?.event?.clearInstanceListeners?.(autocomplete)
      } catch {
        // ignore
      }
    }
  }, [apiKey])

  return (
    <div className="jx-address-autocomplete" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--jx-ink)' }}>
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: '#b3261e' }}>
            {' '}
            *
          </span>
        ) : null}
      </label>
      <input
        ref={inputRef}
        id={id}
        className="jx-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{ width: '100%', minWidth: 0 }}
      />
      {error ? (
        <p id={errorId} role="alert" style={{ margin: 0, fontSize: 12, color: '#b3261e' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
