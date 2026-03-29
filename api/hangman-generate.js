import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_ID = 'hangman'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { theme } = req.body || {}
  if (!theme) return res.status(400).json({ error: 'theme requis' })

  try {
    // Récupère les mots déjà utilisés
    const { data: existing } = await supabase
      .from('hangman_state').select('word').eq('session_id', SESSION_ID)
    const usedWords = (existing || []).map(r => r.word).filter(Boolean)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Tu génères des mots pour un jeu du pendu en live TikTok francophone.

Thème : "${theme}"

Règles :
- Un seul mot (pas d'expression ni de phrase)
- Entre 5 et 12 lettres
- Connu du grand public français
- Pas d'accents, pas de tirets, uniquement des lettres A-Z
- Pas trop facile, pas trop difficile
${usedWords.length > 0 ? `- Mots déjà utilisés à ne pas répéter : ${usedWords.join(', ')}` : ''}

Retourne UNIQUEMENT le mot en majuscules, rien d'autre.`
        }]
      })
    })

    const data = await response.json()
    const word = data.content?.[0]?.text?.trim().toUpperCase().replace(/[^A-Z]/g, '')

    if (!word || word.length < 4) throw new Error('Mot invalide généré')

    return res.status(200).json({ success: true, word })
  } catch (err) {
    console.error('[hangman-generate]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
