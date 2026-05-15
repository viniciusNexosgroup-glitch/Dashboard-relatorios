'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Client {
  id: string
  name: string
  company: string
  phone: string
  whatsappGroup: string | null
  notes: string | null
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const method = client ? 'PUT' : 'POST'
    const url = client ? `/api/clients/${client.id}` : '/api/clients'
    await fetch(url, {
      method,
      body: JSON.stringify(form),
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(false)
    onSave()
  }

  const fields: { label: string; key: keyof typeof form; type?: string; placeholder: string }[] = [
    { label: 'Nome do responsável', key: 'name', placeholder: 'João Silva' },
    { label: 'Empresa', key: 'company', placeholder: 'Empresa Ltda' },
    { label: 'WhatsApp', key: 'phone', placeholder: '11999999999' },
    { label: 'ID do grupo de WhatsApp', key: 'whatsappGroup', placeholder: '55119999999-1234567890@g.us' },
    { label: 'Observações', key: 'notes', placeholder: 'Preferências do cliente...' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {client ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.key === 'notes' ? (
                <textarea
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              ) : (
                <input
                  type={f.type || 'text'}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  required={f.key === 'name' || f.key === 'company' || f.key === 'phone'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
