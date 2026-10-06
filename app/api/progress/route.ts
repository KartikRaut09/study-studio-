import {getChatGPTUser} from '../../chatgpt-auth';
import {progressDb} from '../../../db/store';
import plan from '../../plan.json';
export const dynamic='force-dynamic';

const ids=new Map<string,string>([
  ...plan.topics.map(t=>[t.id,'topic'] as [string,string]),
  ...plan.tasks.map(t=>[t.id,'task'] as [string,string])
]);

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(){
  const user=await getChatGPTUser();
  if(!user) return reply({error:'Please sign in to load your progress.'},401);
  try {
    const rows=await progressDb()
      .prepare('SELECT item_id, payload FROM study_progress WHERE user_id = ?')
      .bind(user.userId)
      .all<{item_id:string,payload:string}>();
    return reply({
      progress: Object.fromEntries(rows.results.map(r=>[r.item_id,JSON.parse(r.payload)]))
    });
  } catch(e) {
    console.error('Progress load failed',e);
    return reply({error:'Your progress could not be loaded. Please retry.'},503);
  }
}

export async function PUT(request:Request){
  const user=await getChatGPTUser();
  if(!user) return reply({error:'Please sign in to save your progress.'},401);
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin) return reply({error:'This request is not allowed.'},403);
  
  let body:unknown;
  try { body=await request.json(); } catch { return reply({error:'Invalid request.'},400); }
  
  if(!body || typeof body!=='object' || !('id' in body) || typeof body.id!=='string' || !('value' in body) || !body.value || typeof body.value!=='object') {
    return reply({error:'Invalid study item.'},400);
  }

  const itemId = body.id;
  let kind: string;

  if (itemId.startsWith('__') && itemId.endsWith('__')) {
    kind = 'meta';
  } else if (ids.has(itemId)) {
    kind = ids.get(itemId)!;
    const value = body.value as Record<string, unknown>;
    const allowed = kind==='topic'
      ? ['lesson','practice','pyqs','revision','notes','confidence','pyqAttempted','pyqCorrect','keyPoints','doubtText','doubtResolved','lastStudied']
      : ['done','hours','notes','rescheduledDate','originalDate'];
    
    if(Object.keys(value).some(k=>!allowed.includes(k))) return reply({error:'Unknown progress field.'},400);

    for(const [k,v] of Object.entries(value)){
      if(k==='notes' || k==='keyPoints' || k==='doubtText'){
        if(typeof v!=='string' || v.length>2000) return reply({error:`${k} must be 2,000 characters or fewer.`},400);
      } else if(k==='hours'){
        if(v!==null && (typeof v!=='number' || !Number.isFinite(v) || v<0 || v>24)) return reply({error:'Enter hours between 0 and 24.'},400);
      } else if(k==='confidence'){
        if(v!==null && !['low','medium','high','mastered'].includes(v as string)) return reply({error:'Invalid confidence rating.'},400);
      } else if(k==='pyqAttempted' || k==='pyqCorrect'){
        if(v!==null && (typeof v!=='number' || !Number.isInteger(v) || (v as number)<0)) return reply({error:'Invalid question count.'},400);
      } else if(k==='rescheduledDate' || k==='originalDate' || k==='lastStudied'){
        if(v!==null && typeof v!=='string') return reply({error:'Invalid date string.'},400);
      } else if(typeof v!=='boolean'){
        return reply({error:'Completion must be checked or unchecked.'},400);
      }
    }
  } else {
    return reply({error:'Unknown study item.'},400);
  }

  try {
    await progressDb()
      .prepare('INSERT INTO study_progress (user_id,item_id,kind,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at')
      .bind(user.userId,itemId,kind,JSON.stringify(body.value),new Date().toISOString())
      .run();
    return reply({ok:true});
  } catch(e) {
    console.error('Progress save failed',e);
    return reply({error:'Could not save. Please retry; your previous saved progress is unchanged.'},503);
  }
}
