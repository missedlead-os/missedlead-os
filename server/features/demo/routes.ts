/**
 * 데모 로그인 엔드포인트 POST /api/demo/login. DEMO_MODE=true + 고정 자격증명(test/test)
 * + env의 격리 데모 고객/공급자 계정으로 세션을 발급한다. 운영자 세션은 발급하지 않는다.
 */
import { createClient } from '@supabase/supabase-js';
import type { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
const credentials = z.union([
 z.object({username:z.literal('test'),password:z.literal('test')}).strict(),
 z.object({role:z.enum(['customer','provider','operator'])}).strict(),
]);
const config = z.object({
 SUPABASE_URL:z.string().url(),SUPABASE_ANON_KEY:z.string().min(1),
 DEMO_CUSTOMER_EMAIL:z.string().email(),DEMO_CUSTOMER_PASSWORD:z.string().min(6),
 DEMO_PROVIDER_EMAIL:z.string().email().optional(),DEMO_PROVIDER_PASSWORD:z.string().min(6).optional(),
});
export function registerDemoRoutes(app: Express) {
 const limiter = rateLimit({windowMs:60_000,limit:10,keyGenerator:()=>"shared-demo-login",standardHeaders:'draft-8',legacyHeaders:false,message:{error:'demo_login_rate_limited'}});
 app.post('/api/demo/login', (req,res,next) => {
  res.setHeader('Cache-Control','no-store');
  if(process.env.DEMO_MODE !== 'true') {res.status(404).json({error:'not_found'});return;}
  limiter(req,res,next);
 }, async(req,res) => {
  const parsedCredentials=credentials.safeParse(req.body);
  if(!parsedCredentials.success) {res.status(401).json({error:'invalid_demo_credentials'});return;}
  const role = 'role' in parsedCredentials.data ? parsedCredentials.data.role : 'customer';
  if (role === 'operator') {res.status(403).json({error:'demo_operator_access_disabled'});return;}
  const parsed = config.safeParse(process.env);
  if(!parsed.success) {res.status(503).json({error:'demo_not_configured'});return;}
  const env = parsed.data;
  const account = role === 'customer'
   ? { email: env.DEMO_CUSTOMER_EMAIL, password: env.DEMO_CUSTOMER_PASSWORD }
   : { email: env.DEMO_PROVIDER_EMAIL, password: env.DEMO_PROVIDER_PASSWORD };
  if (!account.email || !account.password) {res.status(503).json({error:'demo_not_configured'});return;}
  const { email, password } = account;
  const client = createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
   const {data,error} = await client.auth.signInWithPassword({ email, password });
   if(error || !data.session || data.user?.app_metadata.demo !== true) {res.status(503).json({error:'demo_unavailable'});return;}
   const profile = await client.from('profiles').select('role,is_demo').eq('id',data.user.id).single();
   if(profile.error || profile.data?.role !== role || profile.data?.is_demo !== true) {res.status(503).json({error:'demo_unavailable'});return;}
   const authority = await client.rpc('is_operator');
   if (authority.error || authority.data !== false) {res.status(503).json({error:'demo_unavailable'});return;}
   res.json({access_token:data.session.access_token,refresh_token:data.session.refresh_token,actor:{id:data.user.id,email:data.user.email,role}});
  } catch {res.status(503).json({error:'demo_unavailable'});}
 });
}
