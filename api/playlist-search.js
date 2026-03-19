// api/playlist-search.js
// Génère une playlist via Claude AI selon un thème

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { theme } = req.body || {}
  if (!theme) return res.status(400).json({ error: 'Missing theme' })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Génère une playlist de blind test sur le thème : "${theme}".
Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans markdown.
Format exact :
[{"title":"Titre exact","artist":"Artiste exact"},{"title":"...","artist":"..."}]
Entre 10 et 15 chansons. Chansons connues et reconnaissables, adaptées à un blind test TikTok Live.`
      }]
    })
  })

  const data = await response.json()
  const text = data.content?.[0]?.text || '[]'

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const songs = JSON.parse(clean)
    res.status(200).json({ songs })
  } catch {
    res.status(500).json({ error: 'Parse error', raw: text })
  }
}
