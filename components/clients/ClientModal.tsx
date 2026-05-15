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
  const [form, setForm] = useState({
    name: client?.name || '',
    company: client?.company || '',
    phone: client?.phone || '',
    whatsappGroup: client?.whatsappGroup || '',
    notes: client?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  // WhatsApp groups
  const [groups, setGroups] = useState<WhatsappGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupsError, setGroupsError] = useState('')

  // Meta accounts
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [metaError, setMetaError] = useState('')
  const [selectedMeta, setSelectedMeta] = useState<Set<string>>(new Set())

  const isEditing = !!client

  useEffect(() => {
    fetchGroups()
    if (!isEditing) fetchMetaAccounts()
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

  function toggleMeta(id: string) {
    setSelectedMeta((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllMeta() {
    if (selectedMeta.size === metaAccounts.length) {
      setSelectedMeta(new Set())
    } else {
      setSelectedMeta(new Set(metaAccounts.map((a) => a.id)))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const method = client ? 'PUT' : 'POST'
    const url = client ? `/api/clients/${client.id}` : '/api/clients'

    const res = await fetch(url, {
      method,
      body: JSON.stringify(form),
      headers: { 'Content-Type': 'application/json' },
    })
    const saved = await res.json()

    // Vincular contas Meta selecionadas
    if (!isEditing && saved.id && selectedMeta.size > 0) {
      const token = '' // token vem do .env no backend
      for (const accId of selectedMeta) {
        const acc = metaAccounts.find((a) => a.id === accId)
        if (!acc) continue
        await fetch('/api/ad-accounts', {
          method: 'POST',
          body: JSON.stringify({
            clientId: saved.id,
            platform: 'META',
            accountId: acc.id,
            accountName: acc.name,
            accessToken: process.env.NEXT_PUBLIC_META_USE_SYSTEM_TOKEN || '__system__',
          }),
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    setLoading(false)
    onSave()
  }

  const statusLabel = (s: number) =>
    s === 1 ? 'Ativa' : s === 2 ? 'Desativada' : s === 3 ? 'Não confirmada' : 'Pausada'

  const statusColor = (s: number) =>
    s === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-5">

              {/* Dados básicos */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Dados do Cliente</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome do responsável *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                        placeholder="João Silva"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        required
                        placeholder="Empresa Ltda"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      required
                      placeholder="11999999999"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Preferências do cliente..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Grupo WhatsApp */}
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
                ) : groupsError ? (
                  <div className="space-y-2">
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      ⚠ Evolution API não configurada — insira o ID manualmente.
                    </div>
                    <input
                      type="text"
                      value={form.whatsappGroup}
                      onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })}
                      placeholder="55119999999-1234567890@g.us"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ) : groups.length === 0 ? (
                  <input
                    type="text"
                    value={form.whatsappGroup}
                    onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })}
                    placeholder="55119999999-1234567890@g.us"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <select
                    value={form.whatsappGroup}
                    onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Selecione um grupo...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} {g.participants > 0 ? `(${g.participants} participantes)` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Contas Meta Ads — só no cadastro novo */}
              {!isEditing && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      📘 Contas Meta Ads
                    </h3>
                    <div className="flex items-center gap-3">
                      {metaAccounts.length > 0 && (
                        <button type="button" onClick={selectAllMeta} className="text-xs text-indigo-600 hover:underline">
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
                      <Loader2 className="w-4 h-4 animate-spin" /> Buscando contas do Meta Ads...
                    </div>
                  ) : metaError ? (
                    <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{metaError}</span>
                    </div>
                  ) : metaAccounts.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">Nenhuma conta encontrada.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                      {metaAccounts.map((acc, i) => {
                        const checked = selectedMeta.has(acc.id)
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => toggleMeta(acc.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                              i > 0 ? 'border-t border-gray-100' : ''
                            } ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                          >
                            {checked
                              ? <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                              : <Square className="w-4 h-4 text-gray-300 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{acc.name}</p>
                              <p className="text-xs text-gray-400">{acc.id} {acc.business ? `· ${acc.business}` : ''}</p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor(acc.status)}`}>
                              {statusLabel(acc.status)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {selectedMeta.size > 0 && (
                    <p className="text-xs text-indigo-600 mt-2 font-medium">
                      {selectedMeta.size} conta{selectedMeta.size > 1 ? 's' : ''} selecionada{selectedMeta.size > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 pt-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
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
