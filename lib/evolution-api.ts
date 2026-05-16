import axios from 'axios'

const api = (timeoutMs = 30000) =>
  axios.create({
    baseURL: process.env.EVOLUTION_API_URL,
    timeout: timeoutMs,
    headers: {
      apikey: process.env.EVOLUTION_API_KEY,
      'Content-Type': 'application/json',
    },
  })

const instance = process.env.EVOLUTION_INSTANCE_NAME || 'agencia'

export async function sendTextMessage(groupId: string, text: string): Promise<void> {
  await api().post(`/message/sendText/${instance}`, {
    number: groupId,
    textMessage: { text },
  })
}

export async function sendDocumentMessage(
  groupId: string,
  documentBase64: string,
  filename: string,
  caption: string
): Promise<void> {
  await api().post(`/message/sendMedia/${instance}`, {
    number: groupId,
    mediatype: 'document',
    mimetype: 'application/pdf',
    caption,
    media: documentBase64,
    fileName: filename,
  })
}

export async function fetchGroups(): Promise<{ id: string; name: string }[]> {
  try {
    // Short timeout — Clientes page must render even if WhatsApp instance is offline
    const res = await api(15000).get(`/group/fetchAllGroups/${instance}?getParticipants=false`)
    const groups = (res.data || []).map((g: any) => ({
      id: g.id,
      name: g.subject || g.name || g.id,
    }))
    groups.sort((a: any, b: any) => a.name.localeCompare(b.name))
    return groups
  } catch (e: any) {
    // Silent fail — page renders without group names. Use console.warn (not error)
    // so Next.js dev overlay doesn't pop up.
    console.warn('[evolution-api] fetchGroups unavailable:', e.message)
    return []
  }
}

export async function getInstanceStatus(): Promise<{
  connected: boolean
  state: string
}> {
  try {
    const res = await api().get(`/instance/connectionState/${instance}`)
    return {
      connected: res.data.instance?.state === 'open',
      state: res.data.instance?.state || 'unknown',
    }
  } catch {
    return { connected: false, state: 'error' }
  }
}
