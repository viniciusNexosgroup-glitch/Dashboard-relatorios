'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Loader2, MessageSquare, RefreshCw } from 'lucide-react'

interface Client {
  id: string
  name: string
  company: string
  phone: string
  whatsappGroup: string | null
  notes: string | null
}

interface AdAccountEntry {
  platform: 'META' | 'GOOGLE'
  accountId: string
  accountName: string
  accessToken: string
  refreshToken: string
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

const emptyAccount = (): AdAccountEntry => ({
  platform: 'META',
  accountId: '',
  accountName: '',
  accessToken: '',
  refreshToken: '',
})

export function ClientModal({ client, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    name: client?.name || '',
    company: client?.company || '',
    phone: client?.phone || '',
    whatsappGroup: client?.whatsappGroup || '',
    notes: client?.notes || '',
  })
  const [accounts, setAccounts] = useState<AdAccountEntry[]>([emptyAccount()])
  const [loading, setLoading] = useState(false)

  const [groups, setGroups] = useState<WhatsappGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupsError, setGroupsError] = useState('')

  useEffect(() => {
    fetchGroups()
  }, [])

  async function fetchGroups() {
    setLoadingGroups(true)
    setGroupsError('')
    try {
      const res = await fetch('/api/whatsapp/groups')
      const data = await res.json()
      if (data.error && !data.groups?.length) {
        setGroupsError(data.error)
      }
      setGroups(data.groups || [])
    } catch {
      setGroupsError('Erro ao buscar grupos')
    }
    setLoadingGroups(false)
  }

  function addAccount() {
    setAccounts([...accounts, emptyAccount()])
  }

  function removeAccount(i: number) {
    setAccounts(accounts.filter((_, idx) => idx !== i))
  }

  function updateAccount(i: number, field: keyof AdAccountEntry, value: string) {
    setAccounts(accounts.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)))
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

    // Save ad accounts for new clients
    if (!client && saved.id) {
      for (const acc of accounts) {
        if (!acc.accountId || !acc.accountName) continue
        await fetch('/api/ad-accounts', {
          method: 'POST',
          body: JSON.stringify({ ...acc, clientId: saved.id }),
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    setLoading(false)
    onSave()
  }

  const isEditing = !!client

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
                  <button
                    type="button"
                    onClick={fetchGroups}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingGroups ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
                </div>

                {loadingGroups ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando grupos...
                  </div>
                ) : groupsError ? (
                  <div className="space-y-2">
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      ⚠ {groupsError === 'Evolution API não configurada'
                        ? 'Configure a Evolution API no .env para carregar os grupos automaticamente.'
                        : `Não foi possível carregar grupos: ${groupsError}`}
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
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">Nenhum grupo encontrado na instância.</p>
                    <input
                      type="text"
                      value={form.whatsappGroup}
                      onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })}
                      placeholder="55119999999-1234567890@g.us"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
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

              {/* Contas de anúncio — só no cadastro novo */}
              {!isEditing && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Contas de Anúncio
                    </h3>
                    <button
                      type="button"
                      onClick={addAccount}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Adicionar conta
                    </button>
                  </div>

                  <div className="space-y-3">
                    {accounts.map((acc, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative">
                        {accounts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAccount(i)}
                            className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Plataforma</label>
                            <div className="flex gap-2">
                              {(['META', 'GOOGLE'] as const).map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => updateAccount(i, 'platform', p)}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                    acc.platform === p
                                      ? p === 'META'
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-red-600 text-white border-red-600'
                                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                                  }`}
                                >
                                  {p === 'META' ? '📘 Meta Ads' : '🔴 Google Ads'}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                {acc.platform === 'META' ? 'ID da Conta (act_...)' : 'ID do Cliente Google'}
                              </label>
                              <input
                                type="text"
                                value={acc.accountId}
                                onChange={(e) => updateAccount(i, 'accountId', e.target.value)}
                                placeholder={acc.platform === 'META' ? 'act_1234567890' : '123-456-7890'}
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Nome da Conta</label>
                              <input
                                type="text"
                                value={acc.accountName}
                                onChange={(e) => updateAccount(i, 'accountName', e.target.value)}
                                placeholder="Ex: Conta Principal"
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {acc.platform === 'META' ? 'Token de Acesso Meta' : 'Refresh Token Google'}
                            </label>
                            <input
                              type="password"
                              value={acc.platform === 'META' ? acc.accessToken : acc.refreshToken}
                              onChange={(e) =>
                                updateAccount(
                                  i,
                                  acc.platform === 'META' ? 'accessToken' : 'refreshToken',
                                  e.target.value
                                )
                              }
                              placeholder={acc.platform === 'META' ? 'EAAxxxxxxx...' : '1//0xxxxxxx...'}
                              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                              {acc.platform === 'META'
                                ? 'Token de longa duração do Meta Business (60 dias)'
                                : 'Gerado via Google OAuth Playground'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
