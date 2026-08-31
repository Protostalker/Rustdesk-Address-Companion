import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import CompanyCard from '../components/CompanyCard.jsx'
import DeviceCard from '../components/DeviceCard.jsx'
import DeviceDetailDrawer from '../components/DeviceDetailDrawer.jsx'
import EmptyState from '../components/EmptyState.jsx'
import SyncStatus from '../components/SyncStatus.jsx'

export default function Home({ onToast, launchEnabled }) {
  const [companies, setCompanies] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)
  const [search, setSearch] = useState('')
  const [syncStatus, setSyncStatus] = useState(null)
  const [drawerDevice, setDrawerDevice] = useState(null)
  const [settings, setSettings] = useState(null)

  const refresh = useCallback(async () => {
    const [cs, ds, st, sg] = await Promise.all([
      api.listCompanies(),
      api.listDevices(),
      api.syncStatus(),
      api.getSettings(),
    ])
    setCompanies(cs)
    setDevices(ds)
    setSyncStatus(st)
    setSettings(sg)
  }, [])

  useEffect(() => {
    refresh().catch((e) => onToast?.('Error: ' + e.message))
  }, [refresh, onToast])

  const visibleDevices = useMemo(() => {
    let list = devices
    if (selectedCompanyId !== null) {
      list = list.filter(d => d.companies?.some(c => c.id === selectedCompanyId))
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(d =>
        (d.nickname || '').toLowerCase().includes(s) ||
        (d.rustdesk_id || '').toLowerCase().includes(s) ||
        (d.hostname || '').toLowerCase().includes(s) ||
        (d.alias_from_rustdesk || '').toLowerCase().includes(s) ||
        (d.notes || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [devices, selectedCompanyId, search])

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) || null

  const triggerSync = async () => {
    try {
      const st = await api.triggerSync()
      setSyncStatus(st)
      // Give the background job a moment, then refresh data.
      setTimeout(() => refresh().catch(() => {}), 900)
      onToast?.('Sync triggered')
    } catch (e) {
      onToast?.('Sync error: ' + e.message)
    }
  }

  return (
    <div className="home">
      <div className="home-header">
        <h1>Address Book</h1>
        <input
          type="search"
          className="search"
          placeholder="Search nickname, ID, hostname, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="spacer" />
        <SyncStatus status={syncStatus} onTrigger={triggerSync} compact />
      </div>

      <div className="home-main">
        <aside className="home-sidebar">
          <button
            type="button"
            className={`company-tile ${selectedCompanyId === null ? 'active' : ''}`}
            onClick={() => setSelectedCompanyId(null)}
          >
            <span>All devices</span>
            <span className="count">{devices.length}</span>
          </button>
          {companies.map(c => (
            <CompanyCard
              key={c.id}
              company={c}
              active={selectedCompanyId === c.id}
              onClick={() => setSelectedCompanyId(c.id)}
            />
          ))}
          {companies.length === 0 && (
            <div className="muted" style={{ padding: '12px 4px' }}>
              No companies yet. Create some in Setup.
            </div>
          )}
        </aside>

        <main className="home-content">
          <div style={{ marginBottom: 12 }} className="muted">
            {selectedCompany ? <>Company: <strong style={{ color: 'inherit' }}>{selectedCompany.name}</strong> · {visibleDevices.length} device(s)</> : <>{visibleDevices.length} device(s)</>}
          </div>

          {visibleDevices.length === 0 ? (
            <EmptyState
              title={devices.length === 0 ? 'No devices yet' : 'No devices match your filter'}
              description={
                devices.length === 0
                  ? 'Sync will run automatically if a RustDesk DB is mounted, or add devices manually in Setup.'
                  : 'Try clearing the search or choosing a different company.'
              }
            />
          ) : (
            <div className="device-grid">
              {visibleDevices.map(d => (
                <DeviceCard
                  key={d.id}
                  device={d}
                  launchEnabled={launchEnabled}
                  onOpen={(dev) => setDrawerDevice(dev)}
                  onToast={onToast}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {drawerDevice && (
        <DeviceDetailDrawer
          device={drawerDevice}
          companies={companies}
          maxCompanies={settings?.max_companies_per_device}
          onClose={() => setDrawerDevice(null)}
          onChanged={async (deleted) => {
            await refresh()
            if (!deleted) {
              // reload the freshest device record for the drawer
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
