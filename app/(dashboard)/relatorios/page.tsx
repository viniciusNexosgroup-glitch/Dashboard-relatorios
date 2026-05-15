import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/utils'
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react'

export default async function RelatoriosPage() {
  const reports = await prisma.report.findMany({
    include: {
      client: { select: { name: true, company: true } },
      whatsappSends: { select: { status: true, sentAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-sm text-gray-500 mt-0.5">{reports.length} relatórios gerados</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Relatório</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Período</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">WhatsApp</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((r) => {
              const waSend = r.whatsappSends[0]
              return (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{r.client.company}</p>
                    <p className="text-xs text-gray-500">{r.client.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <span className="text-gray-700 truncate max-w-xs">{r.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.status === 'READY' ? 'bg-green-100 text-green-700' :
                      r.status === 'ERROR' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {r.status === 'READY' && <CheckCircle className="w-3 h-3" />}
                      {r.status === 'ERROR' && <XCircle className="w-3 h-3" />}
                      {r.status === 'GENERATING' && <Clock className="w-3 h-3" />}
                      {r.status === 'READY' ? 'Gerado' : r.status === 'ERROR' ? 'Erro' : 'Gerando'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {waSend ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        waSend.status === 'SENT' ? 'bg-green-100 text-green-700' :
                        waSend.status === 'ERROR' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {waSend.status === 'SENT' ? '✓ Enviado' :
                         waSend.status === 'ERROR' ? '✗ Erro' :
                         waSend.status === 'GROUP_NOT_CONFIGURED' ? 'Sem grupo' :
                         waSend.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {formatDate(r.createdAt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {reports.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>Nenhum relatório gerado ainda</p>
          </div>
        )}
      </div>
    </div>
  )
}
