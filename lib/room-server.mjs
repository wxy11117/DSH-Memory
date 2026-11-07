import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
const ROOT=fileURLToPath(new URL('../room/',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
export async function startRoomService({hub,rooms,resolveSpace,dashboard,life}){
  const tickets=new Map(),streams=new Set();let stopped=false;
  const emit=rooms.subscribe(space=>{for(const stream of streams)if(stream.space===space)stream.res.write('data: changed\n\n')});
  const server=http.createServer(async(req,res)=>{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))};
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    try{
      if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin))return json(403,{error:'仅允许本机同源访问'});
      const url=new URL(req.url,origin);
      if(url.pathname.startsWith('/api/')){
        const ticket=tickets.get(String(req.headers['x-room-access']||''));if(!ticket||ticket.expiresAt<Date.now())return json(401,{error:'链接已失效，请重新调用 hp_room'});
        if(ticket.kind==='room'&&resolveSpace(ticket.session)!==ticket.space)return json(403,{error:'会话已切换记忆空间，请重新打开小屋'});
        if(req.method!=='GET'&&req.method!=='POST')return json(405,{error:'请求方法无效'});
        let body={};if(req.method==='POST'){
          if(!String(req.headers['content-type']).startsWith('application/json'))return json(415,{error:'需要 JSON 请求'});
          let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>260000)return json(413,{error:'请求过大'})}body=JSON.parse(data||'{}');
        }
        if(ticket.kind==='setup'){
          if(url.pathname==='/api/setup'&&req.method==='GET')return json(200,{session:ticket.session,current:hub.resolve(ticket.session),spaces:hub.list()});
          if(url.pathname==='/api/bind'&&req.method==='POST'){
            if(body.confirm!==true)return json(400,{error:'请确认会话与空间的对应关系'});
            const space=hub.bind(ticket.session,body.space,ticket.previous);tickets.delete(ticket.key);return json(200,{ok:true,url:issue(ticket.session,space)});
          }return json(403,{error:'此链接只用于绑定当前会话'});
        }
        const space=ticket.space;
        if(url.searchParams.has('space')||body.space!==undefined)return json(403,{error:'房间只连接绑定的记忆空间'});
        if(url.pathname==='/api/room/connect'&&req.method==='POST')return json(200,rooms.connect(space));
        if(url.pathname==='/api/room/events'&&req.method==='GET'){
          res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('data: connected\n\n');const stream={space,res};streams.add(stream);req.on('close',()=>streams.delete(stream));return;
        }
        if(url.pathname==='/api/room/dashboard'&&req.method==='GET'){const panel=await dashboard(space,ticket.session);return json(200,{url:panel.url,space})}
        if(url.pathname==='/api/room/settings'&&req.method==='GET')return json(200,{...(life?life.status(space):rooms.settings(space)),session:ticket.session});
        if(url.pathname==='/api/room/interface'&&req.method==='POST'){if(Object.keys(body).some(k=>k!=='enabled'))throw new Error('界面设置无效');return json(200,rooms.setInterface(space,body.enabled))}
        if(url.pathname==='/api/room/life'&&req.method==='POST'){if(!life)throw new Error('自主生活接口未就绪');return json(200,life.configure(space,ticket.session,body))}
        if(url.pathname==='/api/room/state'&&req.method==='GET')return json(200,rooms.current(space));
        if(url.pathname==='/api/room/heartbeat'&&req.method==='POST')return json(200,rooms.heartbeat(space,body.clientId,body.runtime));
        if(url.pathname==='/api/room/save'&&req.method==='POST')return json(200,rooms.patch(space,body.clientId,body.changes));
        if(url.pathname==='/api/room/claim'&&req.method==='POST')return json(200,rooms.claim(space,body.clientId));
        if(url.pathname==='/api/room/result'&&req.method==='POST')return json(200,rooms.ack(space,body.clientId,body.id,body.status,body.detail,body.runtime));
        return json(404,{error:'接口不存在'});
      }
      if(!['GET','HEAD'].includes(req.method))return json(405,{error:'请求方法无效'});
      let relative=url.pathname==='/setup'?'setup.html':url.pathname.startsWith('/room/')?decodeURIComponent(url.pathname.slice(6)||'index.html'):null;
      if(!relative)return json(404,{error:'请从 hp_room 返回的完整链接打开'});
      const file=path.resolve(ROOT,relative);if(!file.startsWith(ROOT)||relative.includes('..')||!MIME[path.extname(file)]||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(404,{error:'资源不存在'});
      const bytes=await fs.promises.readFile(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(e){if(!res.headersSent)json(e.status||400,{error:e.message||'房间暂不可用'});else res.end()}
  });
  server.on('error',()=>{});
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve()})})}catch(error){emit();server.close();throw error}
  const origin=`http://127.0.0.1:${server.address().port}`;
  function issue(session,space=null,setup=false){
    if(stopped)throw new Error('房间服务已停止');
    const key=randomBytes(24).toString('base64url');const kind=setup||!space?'setup':'room';
    for(const [key,t]of tickets)if(t.expiresAt<Date.now())tickets.delete(key);
    if(tickets.size>2000)throw new Error('打开链接次数过多，请重启测试插件');
    tickets.set(key,{key,kind,session,space,previous:hub.resolve(session),expiresAt:Date.now()+(kind==='setup'?900000:86400000)});
    return`${origin}${kind==='setup'?'/setup':'/room/'}#access=${key}`;
  }
  const pulse=setInterval(()=>{for(const stream of streams)stream.res.write(': keepalive\n\n')},15000);pulse.unref();server.unref();
  return{server,origin,issue,close:async()=>{stopped=true;clearInterval(pulse);emit();for(const stream of streams)stream.res.end();streams.clear();tickets.clear();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.()})}};
}
