'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, MessageSquare, RefreshCw, CheckSquare, Square, AlertCircle } from 'lucide-react'

interface Client {
  id: string
  name: string
  company: string
  phone: string
  whatsappGroup: string | null
  notes: string | null
}

interface MetaAccount {
  id: string
  name: string
  status: number
  currency: string
  business: string | null
}

interface GoogleAccount {
  id: string
  formattedId: string
  name: string
  currency: string
  status: string
}

interface WhatsappGroup {
  id: string
  name: string
  participants: number
}

interface Props {
  client: Client | null
  onClose: () => void
  onSave: () => void
}

export function ClientModal({ client, onClose, onSave }: Props) {
  const isEditing = !!client

  const [form, setForm] = useState({
    name: client?.name || '',
    company: client?.company || '',
    phone: client?.phone || '',
    whatsappGroup: client?.whatsappGroup || '',
    notes: client?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  const [groups, setGroups] = useState<WhatsappGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupsError, setGroupsError] = useState('')

  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [metaError, setMetaError] = useState('')
  const [selectedMeta, setSelectedMeta] = useState<Set<string>>(new Set())

  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([])
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [selectedGoogle, setSelectedGoogle] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchGroups()
    if (!isEditing) {
      fetchMetaAccounts()
      fetchGoogleAccounts()
    }
  }, [])

  async function fetchGroups() {
    setLoadingGroups(true)
    setGroupsError('')
    try {
      const res = await fetch('/api/whatsapp/groups')
      const data = await res.json()
      if (data.error && !data.groups?.length) setGroupsError(data.error)
      setGroups(data.groups || [])
    } catch {
      setGroupsError('Erro ao buscar grupos')
    }
    setLoadingGroups(false)
  }

  async function fetchMetaAccounts() {
    setLoadingMeta(true)
    setMetaError('')
    try {
      const res = await fetch('/api/meta-ads/accounts')
      const data = await res.json()
      if (data.error && !data.accounts?.length) setMetaError(data.error)
      setMetaAccounts(data.accounts || [])
    } catch {
      setMetaError('Erro ao buscar contas')
    }
    setLoadingMeta(false)
  }

  async function fetchGoogleAccounts() {
    setLoadingGoogle(true)
    setGoogleError('')
    try {
      const res = await fetch('/api/google-ads/accounts')
      const data = await res.json()
      if (data.error && !data.accounts?.length) setGoogleError(data.error)
      setGoogleAccounts(data.accounts || [])
    } catch {
      setGoogleError('Erro ao buscar contas')
    }
    setLoadingGoogle(false)
  }

  function toggleMeta(id: string) {
    setSelectedMeta((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleGoogle(id: string) {
    setSelectedGoogle((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const method = isEditing ? 'PUT' : 'POST'
    const url = isEditing ? `/api/clients/${client.id}` : '/api/clients'

    const res = await fetch(url, {
      method,
      body: JSON.stringify(form),
      headers: { 'Content-Type': 'application/json' },
    })
    const saved = await res.json()

    if (!isEditing && saved.id) {
      for (const accId of selectedMeta) {
        const acc = metaAccounts.find((a) => a.id === accId)
        if (!acc) continue
        await fetch('/api/ad-accounts', {
          method: 'POST',
          body: JSON.stringify({ clientId: saved.id, platform: 'META', accountId: acc.id, accountName: acc.name, accessToken: '__system__' }),
          headers: { 'Content-Type': 'application/json' },
        })
      }
      for (const accId of selectedGoogle) {
        const acc = googleAccounts.find((a) => a.id === accId)
        if (!acc) continue
        await fetch('/api/ad-accounts', {
          method: 'POST',
          body: JSON.stringify({ clientId: saved.id, platform: 'GOOGLE', accountId: acc.id, accountName: acc.name, accessToken: '__system__', refreshToken: '__system__' }),
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    setLoading(false)
    onSave()
  }

  const metaStatusLabel = (s: number) =>
    s === 1 ? 'Ativa' : s === 2 ? 'Desativada' : 'Pausada'
  const metaStatusColor = (s: number) =>
    s === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Dados do Cliente</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome do responsável *</label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="João Silva"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                    <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required placeholder="Empresa Ltda"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="11999999999"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Preferências do cliente..." rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Grupo de WhatsApp
                </h3>
                <button type="button" onClick={fetchGroups} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  <RefreshCw className={`w-3 h-3 ${loadingGroups ? 'animate-spin' : ''}`} /> Atualizar
                </button>
              </div>
              {loadingGroups ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando grupos...
                </div>
              ) : groupsError || groups.length === 0 ? (
                <div className="space-y-2">
                  {groupsError && (
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      Configure a Evolution API no .env para carregar os grupos automaticamente.
                    </div>
                  )}
                  <input type="text" value={form.whatsappGroup} onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })}
                    placeholder="55119999999-1234567890@g.us"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ) : (
                <select value={form.whatsappGroup} onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">Selecione um grupo...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.participants > 0 ? ` (${g.participants} participantes)` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!isEditing && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">📘 Contas Meta Ads</h3>
                  <div className="flex items-center gap-3">
                    {metaAccounts.length > 0 && (
                      <button type="button" onClick={() => setSelectedMeta(selectedMeta.size === metaAccounts.length ? new Set() : new Set(metaAccounts.map((a) => a.id)))}
                        className="text-xs text-indigo-600 hover:underline">
                        {selectedMeta.size === metaAccounts.length ? 'Desmarcar todas' : 'Selecionar todas'}
                      </button>
                    )}
                    <button type="button" onClick={fetchMetaAccounts} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                      <RefreshCw className={`w-3 h-3 ${loadingMeta ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                  </div>
                </div>
                {loadingMeta ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando contas...
                  </div>
                ) : metaError ? (
                  <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{metaError}</span>
                  </div>
                ) : metaAccounts.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Nenhuma conta encontrada.</p>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {metaAccounts.map((acc, i) => (
                      <button key={acc.id} type="button" onClick={() => toggleMeta(acc.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${selectedMeta.has(acc.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                        {selectedMeta.has(acc.id)
                          ? <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                          : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{acc.name}</p>
                          <p className="text-xs text-gray-400">{acc.id}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${metaStatusColor(acc.status)}`}>
                          {metaStatusLabel(acc.status)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedMeta.size > 0 && (
                  <p className="text-xs text-indigo-600 mt-2 font-medium">{selectedMeta.size} conta(s) selecionada(s)</p>
                )}
              </div>
            )}

            {!isEditing && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">🔴 Contas Google Ads</h3>
                  <div className="flex items-center gap-3">
                    {googleAccounts.length > 0 && (
                      <button type="button" onClick={() => setSelectedGoogle(selectedGoogle.size === googleAccounts.length ? new Set() : new Set(googleAccounts.map((a) => a.id)))}
                        className="text-xs text-indigo-600 hover:underline">
                        {selectedGoogle.size === googleAccounts.length ? 'Desmarcar todas' : 'Selecionar todas'}
                      </button>
                    )}
                    <button type="button" onClick={fetchGoogleAccounts} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                      <RefreshCw className={`w-3 h-3 ${loadingGoogle ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                  </div>
                </div>
                {loadingGoogle ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando contas...
                  </div>
                ) : googleError ? (
                  <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{googleError}</span>
                  </div>
                ) : googleAccounts.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Nenhuma conta encontrada.</p>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {googleAccounts.map((acc, i) => (
                      <button key={acc.id} type="button" onClick={() => toggleGoogle(acc.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${selectedGoogle.has(acc.id) ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        {selectedGoogle.has(acc.id)
                          ? <CheckSquare className="w-4 h-4 text-red-600 shrink-0" />
                          : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{acc.name}</p>
                          <p className="text-xs text-gray-400">{acc.formattedId} · {acc.currency}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${acc.status === 'ENABLED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {acc.status === 'ENABLED' ? 'Ativa' : 'Pausada'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedGoogle.size > 0 && (
                  <p className="text-xs text-red-600 mt-2 font-medium">{selectedGoogle.size} conta(s) selecionada(s)</p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Salvando...' : 'Salvar Cliente'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}
