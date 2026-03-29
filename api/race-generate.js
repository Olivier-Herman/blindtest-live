const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_ID = 'bulls-race'

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Tu es un créateur de quiz pour émission TV française. Génère exactement 40 questions de culture générale variées, fun et accessibles au grand public francophone pour un jeu en live TikTok.

Catégories à mélanger : géographie, histoire, sport, cinéma, musique, science, gastronomie, animaux, people/célébrités, jeux vidéo.

Règles importantes :
- Questions claires et sans ambiguïté
- Réponses très courtes : 1 ou 2 mots maximum
- La réponse doit être en minuscules, sans accents, sans ponctuation
- Niveau : grand public, ni trop facile ni trop difficile
- Pas de questions sur des dates précises
- Pas de questions trop spécialisées

Retourne UNIQUEMENT un tableau JSON valide, sans markdown, sans texte avant ou après :
[
  {"question": "Quelle est la capitale de l'Espagne ?", "answer": "madrid", "category": "géographie"},
  {"question": "Quel fruit est le symbole de New York ?", "answer": "pomme", "category": "culture"},
  ...
]`
        }]
      })
    })

    const data = await response.json()
    if (!data.content?.[0]?.text) throw new Error('Réponse Claude invalide')

    let text = data.content[0].text.trim()
    text = text.replace(/```json|```/g, '').trim()

    let questions
    try {
      questions = JSON.parse(text)
    } catch {
      throw new Error('JSON invalide dans la réponse Claude')
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Aucune question générée')
    }

    // Supprime les questions non utilisées existantes
    await supabase.from('race_questions').delete().eq('session_id', SESSION_ID).eq('used', false)

    // Normalise et insère les nouvelles questions
    const rows = questions.map((q, i) => ({
      session_id: SESSION_ID,
      question: q.question,
      answer: (q.answer || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, '').trim(),
      category: q.category || 'général',
      used: false,
      position: i
    })).filter(q => q.question && q.answer)

    await supabase.from('race_questions').insert(rows)

    return res.status(200).json({ success: true, count: rows.length })
  } catch (err) {
    console.error('[race-generate]', err)
    return res.status(500).json({ error: err.message })
  }
}
