import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { theme, sessionId } = req.body || {}
  if (!theme || !sessionId) return res.status(400).json({ error: 'theme et sessionId requis' })

  try {
    // Récupère les titres déjà dans la playlist pour éviter les doublons
    const { data: existing } = await supabase
      .from('playlist').select('title, artist').eq('session_id', sessionId)

    const existingList = (existing || []).map(s => `${s.title} - ${s.artist}`).slice(0, 100)
    const excludeBlock = existingList.length > 0
      ? `\n\nCHANSONS DÉJÀ DANS LA PLAYLIST (à ne pas répéter) :\n${existingList.join('\n')}`
      : ''

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Tu es un expert en musique pour un blind test en live TikTok francophone.

Génère exactement 20 chansons pour un blind test sur le thème : "${theme}"

Règles :
- Chansons connues et reconnaissables en quelques secondes
- Mix de classiques et de succès plus récents
- Variété dans les artistes
- Adapté au grand public francophone
- Titres et artistes exacts (orthographe correcte)${excludeBlock}

Retourne UNIQUEMENT un tableau JSON valide, sans markdown :
[
  {"title": "Titre exact de la chanson", "artist": "Nom de l'artiste"},
  ...
]`
        }]
      })
    })

    const data = await response.json()
    if (!data.content?.[0]?.text) throw new Error('Réponse Claude invalide')

    let text = data.content[0].text.trim()
    text = text.replace(/```json|```/g, '').trim()

    let songs
    try { songs = JSON.parse(text) }
    catch (e) { throw new Error('JSON invalide: ' + e.message) }

    if (!Array.isArray(songs) || songs.length === 0) throw new Error('Aucune chanson générée')

    // Insère dans la playlist
    const maxPos = existing?.length || 0
    const rows = songs.map((s, i) => ({
      session_id: sessionId,
      title: s.title,
      artist: s.artist,
      played: false,
      position: maxPos + i
    })).filter(s => s.title && s.artist)

    await supabase.from('playlist').insert(rows)

    return res.status(200).json({ success: true, count: rows.length, songs: rows })
  } catch (err) {
    console.error('[blindtest-generate]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
