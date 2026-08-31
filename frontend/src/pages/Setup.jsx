import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import CopyButton from '../components/CopyButton.jsx'
import DeviceDetailDrawer from '../components/DeviceDetailDrawer.jsx'
import EmptyState from '../components/EmptyState.jsx'
import SyncStatus from '../components/SyncStatus.jsx'

export default function Setup({ onToast }) {
  const [tab, setTab] = useState('devices')
  const [companies, setCompanies] = useState([])
  const [devices, setDevices] = useState([])
  const [syncStatus, setSyncStatus] = useState(null)
  const [drawerDevice, setDrawerDevice] = useState(null)
  const [settings, setSettings] = useState(null)

  // filters
  const [q, setQ] = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [filterSource, setFilterSource] = useState('')

  const refresh = useCallback(async () => {
    const [cs, ds, st, sg] = await Promise.all([
      api.listCompanies(),
      api.listDevices({ q, company_id: filterCompany || undefined, source: filterSource || undefined }),
      api.syncStatus(),
      api.getSettings(),
    ])
    setCompanies(cs)
    setDevices(ds)
    setSyncStatus(st)
    setSettings(sg)
  }, [q, filterCompany, filterSource])

  const maxCompanies = settings?.max_companies_per_device ?? 2

  useEffect(() => {
    const t = setTimeout(() => refresh().catch((e) => onToast?.('Error: ' + e.message)), 200)
    return () => clearTimeout(t)
  }, [refresh, onToast])

  const triggerSync = async () => {
    try {
      const st = await api.triggerSync()
      setSyncStatus(st)
      setTimeout(() => refresh().catch(() => {}), 900)
      onToast?.('Sync triggered')
    } catch (e) {
      onToast?.('Sync error: ' + e.message)
    }
  }

  return (
    <div className="setup">
      <h1>Setup</h1>
      <div className="subtitle">Manage companies, devices, assignments, and sync.</div>

      <div className="tabs">
        <button className={`tab ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}>Devices</button>
        <button className={`tab ${tab === 'companies' ? 'active' : ''}`} onClick={() => setTab('companies')}>Companies</button>
        <button className={`tab ${tab === 'sync' ? 'active' : ''}`} onClick={() => setTab('sync')}>Sync & Schema</button>
        <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
      </div>

      {tab === 'devices' && (
        <DevicesTab
          devices={devices}
          companies={companies}
          maxCompanies={maxCompanies}
          q={q} setQ={setQ}
          filterCompany={filterCompany} setFilterCompany={setFilterCompany}
          filterSource={filterSource} setFilterSource={setFilterSource}
          onChanged={refresh}
          onToast={onToast}
          onOpen={(d) => setDrawerDevice(d)}
        />
      )}
      {tab === 'companies' && (
        <CompaniesTab companies={companies} onChanged={refresh} onToast={onToast} />
      )}
      {tab === 'sync' && (
        <SyncTab status={syncStatus} onTrigger={triggerSync} onRefresh={refresh} />
      )}
      {tab === 'settings' && (
        <SettingsTab settings={settings} onChanged={refresh} onToast={onToast} />
      )}

      {drawerDevice && (
        <DeviceDetailDrawer
          device={drawerDevice}
          companies={companies}
          maxCompanies={maxCompanies}
          onClose={() => setDrawerDevice(null)}
          onChanged={async (deleted) => {
            await refresh()
            if (!deleted) {
              try {
                const fresh = await fetch(`/api/devices/${drawerDevice.id}`).then(r => r.ok ? r.json() : null)
                if (fresh) setDrawerDevice(fresh)
              } catch {}
            }
          }}
          onToast={onToast}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------
function DevicesTab({ devices, companies, maxCompanies, q, setQ, filterCompany, setFilterCompany, filterSource, setFilterSource, onChanged, onToast, onOpen }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ rustdesk_id: '', nickname: '', hostname: '', notes: '' })
  const [err, setErr] = useState('')

  const create = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api.createDevice(form)
      setCreating(false)
      setForm({ rustdesk_id: '', nickname: '', hostname: '', notes: '' })
      onToast?.('Device created')
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Filters</h2>
        </div>
        <div className="row wrap">
          <input
            type="search"
            placeholder="Search nickname, ID, hostname, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260, maxWidth: 400 }}
          />
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">All companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">Any source</option>
            <option value="imported">Imported</option>
            <option value="manual">Manual</option>
          </select>
          <div className="grow" />
          <button className="btn primary" onClick={() => setCreating(v => !v)}>
            {creating ? 'Cancel' : '+ New device'}
          </button>
        </div>
      </div>

      {creating && (
        <div className="panel">
          <div className="panel-head"><h2>New manual device</h2></div>
          <form onSubmit={create}>
            {err && <div className="pill warn" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="row wrap">
              <label className="field" style={{ flex: '1 1 200px' }}>
                <span>RustDesk ID</span>
                <input type="text" value={form.rustdesk_id} onChange={(e) => setForm({ ...form, rustdesk_id: e.target.value })} />
              </label>
              <label className="field" style={{ flex: '1 1 200px' }}>
                <span>Nickname</span>
                <input type="text" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
              </label>
              <label className="field" style={{ flex: '1 1 200px' }}>
                <span>Hostname</span>
                <input type="text" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <div className="row">
              <button type="submit" className="btn primary">Create</button>
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Devices ({devices.length})</h2>
        </div>
        {devices.length === 0 ? (
          <EmptyState
            title="No devices match"
            description="Adjust your filters, add a manual device, or wait for the next sync."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Nickname</th>
                <th>RustDesk ID</th>
                <th>Hostname</th>
                <th>Source</th>
                <th>Status</th>
                <th>Companies</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{d.nickname || d.alias_from_rustdesk || '—'}</div>
                    {d.notes && <div className="muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.notes}>{d.notes}</div>}
                  </td>
                  <td className="mono">{d.rustdesk_id || '—'}</td>
                  <td>{d.hostname || '—'}</td>
                  <td><span className="pill">{d.source_type}</span></td>
                  <td>{d.online_status ? <span className={`pill ${d.online_status === 'online' ? 'success' : ''}`}>{d.online_status}</span> : <span className="muted">unknown</span>}</td>
                  <td>
                    {d.companies?.length
                      ? d.companies.map(c => <span key={c.id} className="pill" style={{ marginRight: 4 }}>{c.name}</span>)
                      : <span className="muted">—</span>}
                    {(d.companies?.length || 0) >= maxCompanies && <span className="muted"> (max {maxCompanies})</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <CopyButton value={d.rustdesk_id} label="Copy ID" disabled={!d.rustdesk_id} onCopied={() => onToast?.('Copied')} />
                    <button className="btn small ghost" onClick={() => onOpen(d)} style={{ marginLeft: 4 }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ----------------------------------------------------------------------
function CompaniesTab({ companies, onChanged, onToast }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [editing, setEditing] = useState(null) // {id, name, description}
  const [err, setErr] = useState('')

  const create = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api.createCompany({ name: form.name, description: form.description || null })
      setCreating(false)
      setForm({ name: '', description: '' })
      onToast?.('Company created')
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    }
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api.updateCompany(editing.id, { name: editing.name, description: editing.description || null })
      setEditing(null)
      onToast?.('Company updated')
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    }
  }

  const remove = async (c) => {
    if (!confirm(`Delete company "${c.name}"? Device assignments to this company will be removed.`)) return
    try {
      await api.deleteCompany(c.id)
      onToast?.('Company deleted')
      onChanged?.()
    } catch (e) {
      onToast?.('Error: ' + e.message)
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Companies ({companies.length})</h2>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setCreating(v => !v)}>{creating ? 'Cancel' : '+ New company'}</button>
        </div>

        {creating && (
          <form onSubmit={create} style={{ marginBottom: 12 }}>
            {err && <div className="pill warn" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="row wrap">
              <label className="field" style={{ flex: '1 1 260px' }}>
                <span>Name</span>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="field" style={{ flex: '2 1 300px' }}>
                <span>Description</span>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
            </div>
            <button className="btn primary" type="submit">Create</button>
          </form>
        )}

        {companies.length === 0 ? (
          <EmptyState title="No companies yet" description="Create one to start organizing devices." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Devices</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id}>
                  <td>
                    {editing?.id === c.id ? (
                      <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    ) : (
                      <strong>{c.name}</strong>
                    )}
                  </td>
                  <td>
                    {editing?.id === c.id ? (
                      <input type="text" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                    ) : (
                      c.description || <span className="muted">—</span>
                    )}
                  </td>
                  <td>{c.device_count}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editing?.id === c.id ? (
                      <>
                        <button className="btn small primary" onClick={saveEdit}>Save</button>
                        <button className="btn small ghost" onClick={() => setEditing(null)} style={{ marginLeft: 4 }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn small" onClick={() => setEditing({ id: c.id, name: c.name, description: c.description })}>Edit</button>
                        <button className="btn small danger" onClick={() => remove(c)} style={{ marginLeft: 4 }}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ----------------------------------------------------------------------
function SyncTab({ status, onTrigger, onRefresh }) {
  const rep = status?.schema_report
  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Sync status</h2>
          <div className="spacer" />
          <button className="btn" onClick={onRefresh}>Refresh</button>
          <button className="btn primary" onClick={onTrigger} style={{ marginLeft: 6 }}>Sync now</button>
        </div>
        <SyncStatus status={status} />
        {status?.last_run?.message && (
          <div className="muted" style={{ marginTop: 8 }}>{status.last_run.message}</div>
        )}
      </div>

      <div className="panel">
        <h2>Recent runs</h2>
        {(!status?.recent_runs || status.recent_runs.length === 0) ? (
          <EmptyState title="No runs yet" description="The sync loop runs on startup and every interval." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Started</th>
                <th>Finished</th>
                <th>Status</th>
                <th>Seen</th>
                <th>Ins</th>
                <th>Upd</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {status.recent_runs.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.started_at).toLocaleString()}</td>
                  <td>{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                  <td>
                    <span className={`pill ${r.status === 'success' ? 'success' : r.status === 'error' ? 'warn' : ''}`}>{r.status}</span>
                  </td>
                  <td>{r.devices_seen}</td>
                  <td>{r.devices_inserted}</td>
                  <td>{r.devices_updated}</td>
                  <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.message}>{r.message || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>RustDesk schema inspection</h2>
        {!rep ? (
          <div className="muted">No schema report yet.</div>
        ) : (
          <>
            <div className="statusline" style={{ marginBottom: 8 }}>
              <span>DB path: <span className="mono">{rep.db_path}</span></span>
              <span>·</span>
              <span>Exists: {rep.db_exists ? 'yes' : 'no'}</span>
              <span>·</span>
              <span>Readable: {rep.readable ? 'yes' : 'no'}</span>
              {rep.chosen_table && <><span>·</span><span>Chosen table: <strong>{rep.chosen_table}</strong></span></>}
            </div>
            {rep.column_mapping && (
              <div className="muted" style={{ marginBottom: 8 }}>
                Mapping: <span className="mono">{JSON.stringify(rep.column_mapping)}</span>
              </div>
            )}
            {rep.notes?.length > 0 && (
              <ul style={{ fontSize: 12 }}>
                {rep.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            <details style={{ marginTop: 10 }}>
              <summary className="muted">Show all tables and columns ({rep.tables?.length || 0})</summary>
              <pre className="schema-pre">{JSON.stringify(rep.tables, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </>
  )
}

// ----------------------------------------------------------------------
function SettingsTab({ settings, onChanged, onToast }) {
  const [value, setValue] = useState(settings?.max_companies_per_device ?? 2)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Keep local state in sync when the parent reloads.
  useEffect(() => {
    if (settings?.max_companies_per_device != null) {
      setValue(settings.max_companies_per_device)
    }
  }, [settings?.max_companies_per_device])

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      setErr('Enter a whole number between 1 and 20.')
      return
    }
    setSaving(true)
    try {
      await api.updateSettings({ max_companies_per_device: n })
      onToast?.('Settings saved')
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const current = settings?.max_companies_per_device
  const dirty = Number(value) !== current

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Assignment limits</h2>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Controls how many companies a single device can be assigned to. Enforced
        both by the API and by a SQLite trigger, so direct DB writes cannot
        bypass it. Lowering the value is only allowed when no device currently
        exceeds the new limit.
      </p>
      <form onSubmit={save}>
        {err && <div className="pill warn" style={{ marginBottom: 10 }}>{err}</div>}
        <label className="field" style={{ maxWidth: 260 }}>
          <span>Max companies per device</span>
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="row">
          <button type="submit" className="btn primary" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {current != null && (
            <span className="muted">
              Currently in effect: <strong style={{ color: 'inherit' }}>{current}</strong>
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
