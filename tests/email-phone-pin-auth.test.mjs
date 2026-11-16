import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';
import {normalizeEmail, normalizePhone, isAllowedPassword, isPhoneOnlyCredentialEmail} from '../src/auth-identifiers.js';

function makeEnv() {
  const users=new Map(), creds=new Map(), phones=new Map(), sessions=new Map(), limiterKeys=[];
  const DB={
    prepare(sql) { return {
      bind(...args){this.args=args;return this;},
      async first(){
        const args=this.args||[];
        if(sql.startsWith('SELECT 1 FROM user_credentials WHERE email_normalized'))
          return [...creds.values()].some(c=>c.email_normalized===args[0])?{one:1}:null;
        if(sql.startsWith('SELECT 1 FROM user_phone_logins WHERE phone_e164'))
          return [...phones.values()].some(p=>p===args[0])?{one:1}:null;
        if(sql.includes('FROM auth_sessions AS s JOIN users AS u')) {
          const session=[...sessions.values()][0];
          const u=session&&users.get(session.user_id);
          if(!u)return null;
          const c=creds.get(u.id);return {...u,email_normalized:c.email_normalized,phone_e164:phones.get(u.id)||null};
        }
        if(sql.includes('FROM user_credentials WHERE user_id ='))return creds.get(args[0])||null;
        if(sql.includes('FROM user_credentials AS c JOIN users AS u')) {
          const c= sql.includes('JOIN user_phone_logins AS p')
            ? [...creds.values()].find(v=>phones.get(v.user_id)===args[0])
            : [...creds.values()].find(v=>v.email_normalized===args[0]);
          return c?{...c,...users.get(c.user_id)}:null;
        }
        return null;
      },
      async run(){
        const args=this.args||[];
        if(sql.startsWith('INSERT INTO auth_sessions')){
          sessions.set(args[0],{user_id:args[1],expires_at_ms:args[2]});return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO user_phone_logins')){
          const [id,phone]=args;
          for(const [other,value] of phones)if(other!==id&&value===phone)throw Error('UNIQUE constraint failed: user_phone_logins.phone_e164');
          phones.set(id,phone);return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE user_credentials')){
          const [salt_b64,password_hash_b64,iterations,id,prior]=args;
          const c=creds.get(id);
          if(c?.password_hash_b64!==prior)return {meta:{changes:0}};
          creds.set(id,{...c,salt_b64,password_hash_b64,iterations});return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE auth_sessions'))return {meta:{changes:0}};
        throw Error('Unexpected SQL write: '+sql);
      }
    };},
    async batch(statements){
      for(const stmt of statements){
        const {sql,args}=stmtFor(stmt);
        if(sql.startsWith('INSERT INTO users'))users.set(args[0],{
          id:args[0],public_id:args[1],display_name:args[2],country_code:args[3],
          bio:'',avatar_key:null,status:'active'
        });
        else if(sql.startsWith('INSERT INTO user_credentials'))creds.set(args[0],{
          user_id:args[0],email_normalized:args[1],salt_b64:args[2],
          password_hash_b64:args[3],iterations:args[4]
        });
        else if(sql.startsWith('INSERT INTO user_phone_logins'))phones.set(args[0],args[1]);
        else throw Error('Unexpected batch statement '+sql);
      }
      return statements.map(()=>({meta:{changes:1}}));
    },
  };
  // Inspect prepared SQL transparently: this wrapper records only the query text/parameters.
  const original=DB.prepare.bind(DB);
  DB.prepare=sql=>{
    const statement=original(sql);
    const wrapped={sql,args:[],
      bind(...args){wrapped.args=args;statement.bind(...args);return wrapped;},
      first(){return statement.first();},run(){return statement.run();}};
    return wrapped;
  };
  function stmtFor(s){return {sql:s.sql,args:s.args};}
  return {users,creds,phones,sessions,limiterKeys,
    env:{DB,AUTH_RL:{async limit({key}){limiterKeys.push(key);return {success:true};}}}};
}

async function send(env,path,body,token) {
  const headers={'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  const r=await worker.fetch(new Request('https://sura.invalid'+path,{
    method:body===undefined?'GET':'POST',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),env);
  return {status:r.status,data:await r.json()};
}

test('identifiers normalize E.164 and Bangladesh local format, rejecting ambiguous phone numbers',()=>{
  assert.equal(normalizeEmail('  ALICE@GMAIL.COM  '),'alice@gmail.com');
  assert.equal(normalizeEmail('foo@phone.sura.invalid'),null);
  assert.equal(normalizePhone('01712-345678'),'+8801712345678');
  assert.equal(normalizePhone('+880 1712 345678'),'+8801712345678');
  assert.equal(normalizePhone('0171234'),null);
  assert.equal(normalizePhone('1234567890'),null);
  assert.equal(isAllowedPassword('24681357'),true);
  assert.equal(isAllowedPassword('2468135'),false);
  assert.equal(isAllowedPassword('StrongPass2026'),true); // Legacy strong passwords remain valid.
  assert.equal(isPhoneOnlyCredentialEmail('phone-11111111-1111-4111-8111-111111111111@phone.sura.invalid'),true);
});
test('phone-only PIN signup, login and own profile require no OTP and do not fabricate an email',async()=>{
  const x=makeEnv();
  const registered=await send(x.env,'/api/v1/auth/signup',{
    phone:'01712345678',password:'24681357',display_name:'Phone User',country_code:'BD'});
  assert.equal(registered.status,201,JSON.stringify(registered.data));
  assert.equal(x.phones.size,1);
  assert.equal([...x.phones.values()][0],'+8801712345678');
  assert.equal([...x.creds.values()].some(c=>isPhoneOnlyCredentialEmail(c.email_normalized)),true);
  const login=await send(x.env,'/api/v1/auth/login',{identifier:'+8801712345678',password:'24681357'});
  assert.equal(login.status,200,JSON.stringify(login.data));
  const me=await send(x.env,'/api/v1/me',undefined,login.data.token);
  assert.equal(me.status,200);
  assert.equal(me.data.user.email,null);
  assert.equal(me.data.user.phone,'+8801712345678');
  assert.equal(me.data.user.phone_verified,false);
  const denied=await send(x.env,'/api/v1/auth/login',{identifier:'01712345678',password:'87654321'});
  assert.equal(denied.status,401);
  assert.equal(denied.data.error,'invalid_credentials');
  assert.ok(x.limiterKeys.some(k=>k.startsWith('login-account:')));
});
test('email and phone on the same account both authenticate using one PIN',async()=>{
  const x=makeEnv();
  const registered=await send(x.env,'/api/v1/auth/signup',{email:'Alice@Gmail.com',
    phone:'+4915112345678',password:'31415926',display_name:'Alice',country_code:'DE'});
  assert.equal(registered.status,201,JSON.stringify(registered.data));
  const byEmail=await send(x.env,'/api/v1/auth/login',{identifier:'ALICE@GMAIL.COM',password:'31415926'});
  const byPhone=await send(x.env,'/api/v1/auth/login',{identifier:'+49 15112345678',password:'31415926'});
  assert.equal(byEmail.status,200,JSON.stringify(byEmail.data));
  assert.equal(byPhone.status,200,JSON.stringify(byPhone.data));
  assert.equal(byEmail.data.user.public_id,byPhone.data.user.public_id);
  const duplicate=await send(x.env,'/api/v1/auth/signup',{phone:'+4915112345678',
    password:'11223344',display_name:'Wrong Claim'});
  assert.equal(duplicate.status,409);
  const noIdentifier=await send(x.env,'/api/v1/auth/signup',{password:'12345678',display_name:'Missing'});
  assert.equal(noIdentifier.status,400);
});
test('existing email account can add a phone only with its current password',async()=>{
  const x=makeEnv();
  const registered=await send(x.env,'/api/v1/auth/signup',{
    email:'existing@example.com',password:'23456789',display_name:'Existing'});
  assert.equal(registered.status,201);
  const wrong=await send(x.env,'/api/v1/me/phone',{
    phone:'+8801712345678',current_password:'00000000'},registered.data.token);
  assert.equal(wrong.status,401);
  assert.equal(x.phones.size,0);
  const added=await send(x.env,'/api/v1/me/phone',{
    phone:'01712345678',current_password:'23456789'},registered.data.token);
  assert.equal(added.status,200,JSON.stringify(added.data));
  assert.equal(added.data.phone_verified,false);
  const login=await send(x.env,'/api/v1/auth/login',{
    identifier:'+8801712345678',password:'23456789'});
  assert.equal(login.status,200);
});
test('both Android and web use the real identifier login form without OTP controls',()=>{
  const web=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
  assert.equal(web,app);
  assert.match(web,/name="identifier"/);
  assert.match(web,/name="phone"/);
  assert.match(web,/pattern="\[0-9\]\{8\}"/);
  assert.match(web,/No OTP|no OTP/);
  assert.match(web,/Gmail \/ Email or phone number/);
  assert.match(web,/01712345678 or \+8801712345678/);
  assert.match(web,/8-digit PIN \(no OTP\)/);
  assert.doesNotMatch(web,/type="submit"[^>]*>Send OTP</);
});
