import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import CopyButton from './CopyButton.jsx'
import { rustdeskConnectUrl } from './DeviceCard.jsx'

// Fallback used only if the parent forgot to pass down the setting. The real
// cap is fetched from GET /api/settings and threaded in via the maxCompanies
// prop; the admin can change it from Setup → Settings.
const MAX_COMPANIES_FALLBACK = 2

export default function DeviceDetailDrawer({ device, companies, onClose, onChanged, onToast, maxCompanies }) {
  const MAX_COMPANIES = Number.isFinite(maxCompanies) && maxCompanies > 0
    ? maxCompanies
    : MAX_COMPANIES_FALLBACK
  const [nickname, setNickname] = useState(device.nickname || '')
  const [hostname, setHostname] = useState(device.hostname || '')
  const [notes, setNotes] = useState(device.notes || '')
  const [rustdeskId, setRustdeskId] = useState(device.rustdesk_id || '')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setNickname(device.nickname || '')
    setHostname(device.hostname || '')
    setNotes(device.notes || '')
    setRustdeskId(device.rustdesk_id || '')
    setSelectedCompanyId('')
    setErr('')
  }, [device.id])

  const atMax = (device.companies?.length || 0) >= MAX_COMPANIES

  const save = async () => {
    setSaving(true)
    setErr('')
    try {
      const payload = { nickname, hostname, notes }
      if (device.source_type === 'manual') payload.rustdesk_id = rustdeskId
      await api.updateDevice(device.id, payload)
      onToast?.('Device saved')
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const assign = async () => {
    if (!selectedCompanyId) return
    try {
      await api.assign(device.id, Number(selectedCompanyId))
      setSelectedCompanyId('')
      onToast?.('Company assigned')
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    }
  }

  const unassign = async (companyId) => {
    try {
      await api.unassign(device.id, companyId)
      onToast?.('Company removed')
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this device from the app database? (The RustDesk server is not affected.)')) return
    try {
      await api.deleteDevice(device.id)
      onToast?.('Device deleted')
      onChanged?.(true)
      onClose?.()
    } catch (e) {
      setErr(e.message)
    }
  }

  const assignable = companies.filter(c => !device.companies?.some(dc => dc.id === c.id))

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{device.nickname || device.rustdesk_id || 'Device'}</div>
            <div className="muted mono">{device.rustdesk_id}</div>
          </div>
          <span className="pill">{device.source_type}</span>
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>

        <div className="drawer-body">
          {err && <div className="pill warn" style={{ marginBottom: 10 }}>{err}</div>}

          <label className="field">
            <span>Nickname</span>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </label>
          <label className="field">
            <span>Hostname</span>
            <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} />
          </label>
          <label className="field">
            <span>RustDesk ID {device.source_type === 'imported' && <span className="muted">(read-only for imported devices)</span>}</span>
            <input
              type="text"
              value={rustdeskId}
              onChange={(e) => setRustdeskId(e.target.value)}
              disabled={device.source_type === 'imported'}
            />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="row" style={{ marginBottom: 16 }}>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const url = rustdeskConnectUrl(device.rustdesk_id)
                if (!url) return
                try { window.location.href = url } catch {}
              }}
              disabled={!device.rustdesk_id}
              title={device.rustdesk_id ? `Open RustDesk and connect to ${device.rustdesk_id}` : 'Invalid ID'}
            >Connect</button>
            <CopyButton value={device.rustdesk_id} label="Copy ID" onCopied={() => onToast?.('Copied')} disabled={!device.rustdesk_id} />
            <button className="btn danger" onClick={remove}>Delete</button>
          </div>

          <div className="panel" style={{ padding: 12 }}>
            <div className="panel-head">
              <h2 style={{ fontSize: 13 }}>Companies ({device.companies?.length || 0} / {MAX_COMPANIES})</h2>
            </div>
            <div className="row" style={{ marginBottom: 10 }}>
              {(device.companies || []).map(c => (
                <span key={c.id} className="pill removable" onClick={() => unassign(c.id)} title="Click to remove">
                  {c.name} ×
                </span>
              ))}
              {(device.companies?.length || 0) === 0 && <span className="muted">No companies assigned.</span>}
            </div>
            <div className="row">
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                disabled={atMax || assignable.length === 0}
                style={{ maxWidth: 260 }}
              >
                <option value="">{atMax ? 'Max 2 reached' : assignable.length === 0 ? 'No companies left to add' : 'Select a company…'}</option>
                {assignable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn" onClick={assign} disabled={atMax || !selectedCompanyId}>Assign</button>
            </div>
            {atMax && <div className="muted" style={{ marginTop: 6 }}>Max of 2 companies per device.</div>}
          </div>

          {device.rustdesk_raw_payload_json && (
            <div className="panel" style={{ padding: 12 }}>
              <h2 style={{ fontSize: 13 }}>Last RustDesk payload (debug)</h2>
              <pre className="schema-pre">{(() => {
                try { return JSON.stringify(JSON.parse(device.rustdesk_raw_payload_json), null, 2) } catch { return device.rustdesk_raw_payload_json }
              })()}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
