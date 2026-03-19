import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  await supabase.from('scores').delete().eq('session_id', 'default')
  await supabase.from('comments').delete().eq('session_id', 'default')
  res.status(200).json({ ok: true })
}