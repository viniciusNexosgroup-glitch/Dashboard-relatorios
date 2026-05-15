import axios from 'axios'

const api = () =>
  axios.create({
    baseURL: process.env.EVOLUTION_API_URL,
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
