// Thin fetch wrapper. All routes are under /api (proxied by nginx in compose,
// and by Vite's dev proxy in `npm run dev`).

const BASE = '/api'

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue
      url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const detail = data && data.detail ? data.detail : res.statusText
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return data
}

export const api = {
  // Health
  health: () => request('/health'),

  // Companies
  listCompanies: () => request('/companies'),
  createCompany: (payload) => request('/companies', { method: 'POST', body: payload }),
  updateCompany: (id, payload) => request(`/companies/${id}`, { method: 'PATCH', body: payload }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: 'DELETE' }),

  // Devices
  listDevices: (params) => request('/devices', { params }),
  createDevice: (payload) => request('/devices', { method: 'POST', body: payload }),
  updateDevice: (id, payload) => request(`/devices/${id}`, { method: 'PATCH', body: payload }),
  deleteDevice: (id) => request(`/devices/${id}`, { method: 'DELETE' }),

  // Assignments
  assign: (device_id, company_id) =>
    request('/assignments', { method: 'POST', body: { device_id, company_id } }),
  unassign: (device_id, company_id) =>
    request('/assignments', { method: 'DELETE', params: { device_id, company_id } }),

  // Sync
  syncStatus: () => request('/sync/status'),
  triggerSync: () => request('/sync/trigger', { method: 'POST' }),
  schemaReport: () => request('/sync/schema'),

  // Runtime settings (admin-editable)
  getSettings: () => request('/settings'),
  updateSettings: (payload) => request('/settings', { method: 'PATCH', body: payload }),
}

// Clipboard helper — returns true on success, false on failure.
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Fallback for non-secure contexts (e.g. http://host.local).
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
