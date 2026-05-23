'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, MessageSquare, Edit, Trash2, Bell, BellOff, FileText, FileX } from 'lucide-react'
import { ClientModal } from './ClientModal'

interface Client {
  id: string
  name: string
  company: string
  whatsappGroup: string | null
  whatsappGroupName: string | null
  notes: string | null
  active: boolean
  alertsEnabled: boolean
  reportsEnabled: boolean
  adAccounts: { id: string; platform: string; accountName: string; active: boolean }[]
  _count: { reports: number }
}

interface Props {
  clients: Client[]
}

export function ClientsView({ clients }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Apagar este cliente? Isso vai remover TODAS as campanhas, anúncios e métricas. Pra preservar histórico, considere desativar em vez de apagar.')) return
    await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function handleToggleActive(client: Client) {
    const action = client.active ? 'desativar' : 'reativar'
    if (!confirm(`Tem certeza que deseja ${action} esse cliente?`)) return
    await fetch(`/api/clients/${client.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: client.name,
        company: client.company,
        whatsappGroup: client.whatsappGroup || '',
        whatsappGroupName: client.whatsappGroupName || '',
        notes: client.notes || '',
        active: !client.active,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    router.refresh()
  }

  async function handleToggleSetting(client: Client, field: 'alertsEnabled' | 'reportsEnabled') {
    await fetch(`/api/clients/${client.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: client.name,
        company: client.company,
        whatsappGroup: client.whatsappGroup || '',
        whatsappGroupName: client.whatsappGroupName || '',
        notes: client.notes || '',
        [field]: !client[field],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} clientes cadastrados</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {clients.map((client) => (
          <div key={client.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-sm">{client.company}</h3>
                    <p className="text-xs text-gray-500">{client.name}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => { setEditing(client); setShowModal(true) }}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(client.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-gray-600 mb-4">
              {client.whatsappGroup && (
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 text-green-500 shrink-0" />
                  <span className="text-green-700 font-medium truncate">
                    {client.whatsappGroupName || 'Grupo configurado'}
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">Contas de anúncio</p>
              </div>
              {client.adAccounts.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhuma conta vinculada</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {client.adAccounts.map((acc) => (
                    <span
                      key={acc.id}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        acc.platform === 'META'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {acc.platform === 'META' ? 'Meta' : 'Google'}: {acc.accountName}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Toggles de envios automaticos pro WhatsApp */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
              <button
                onClick={() => handleToggleSetting(client, 'alertsEnabled')}
                title={client.alertsEnabled ? 'Alertas de saldo ATIVOS — clique pra desativar' : 'Alertas de saldo DESATIVADOS — clique pra ativar'}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  client.alertsEnabled
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200 border border-gray-200 line-through'
                }`}
              >
                {client.alertsEnabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                Alertas
              </button>
              <button
                onClick={() => handleToggleSetting(client, 'reportsEnabled')}
                title={client.reportsEnabled ? 'Relatório mensal ATIVO — clique pra desativar' : 'Relatório mensal DESATIVADO — clique pra ativar'}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  client.reportsEnabled
                    ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200 border border-gray-200 line-through'
                }`}
              >
                {client.reportsEnabled ? <FileText className="w-3 h-3" /> : <FileX className="w-3 h-3" />}
                Relatório
              </button>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{client._count.reports} relatórios gerados</span>
              <button
                onClick={() => handleToggleActive(client)}
                title={client.active ? 'Clique para desativar' : 'Clique para reativar'}
                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${
                  client.active
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                {client.active ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <ClientModal
          client={editing}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); router.refresh() }}
        />
      )}

    </div>
  )
}
