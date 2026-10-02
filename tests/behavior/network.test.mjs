import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './loadModules.mjs';
const { startSignalRWithRetry } = await load('signalR');
const { fetchTextWithTimeout } = await load('fetchWithTimeout');
const flush = async () => { for(let i=0;i<15;i++) await Promise.resolve(); };
class Connection {
    state='Disconnected'; starts=0; stops=0; fail=false; closed=[];
    onclose(fn){this.closed.push(fn);}
    async start(){this.starts++;if(this.fail)throw Error('offline');this.state='Connected';}
    async stop(){this.stops++;this.state='Disconnected';for(const fn of this.closed)fn();}
}
test('connection retries offline start and recovers again after reconnect gives up', async () => {
    mock.timers.enable({apis:['setTimeout']});
    try {
        const connection=new Connection();connection.fail=true;
        const handle=startSignalRWithRetry(connection,{retryDelaysMs:[10]});await flush();
        connection.fail=false;mock.timers.tick(10);await flush();assert.equal(connection.starts,2);
        await connection.stop();mock.timers.tick(10);await flush();assert.equal(connection.starts,3);
        await handle.stop();mock.timers.tick(100);await flush();assert.equal(connection.starts,3);
    } finally {mock.timers.reset();}
});
test('a failed group join restarts the socket instead of leaving it silently disconnected from chat', async () => {
    mock.timers.enable({apis:['setTimeout']});
    try {
        const connection=new Connection();let joins=0;
        const handle=startSignalRWithRetry(connection,{retryDelaysMs:[10],onConnected:()=>{if(++joins===1)throw Error('join failed');}});
        await flush();mock.timers.tick(10);await flush();assert.equal(joins,2);assert.equal(connection.state,'Connected');await handle.stop();
    } finally {mock.timers.reset();}
});
test('auth timeout also aborts a stalled response body', async () => {
    mock.timers.enable({apis:['setTimeout']});const original=globalThis.fetch;
    try {
        globalThis.fetch=async (_url,{signal})=>({ok:true,status:200,text:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});
        const result=fetchTextWithTimeout('https://test.invalid',{},10);const failure=assert.rejects(result,{name:'TimeoutError'});
        await flush();mock.timers.tick(10);await failure;
    } finally {globalThis.fetch=original;mock.timers.reset();}
});

test('a transport error that is not the deadline passes through unchanged', async () => {
    const original=globalThis.fetch;
    try {
        globalThis.fetch=async ()=>{throw new TypeError('Network request failed');};
        await assert.rejects(fetchTextWithTimeout('https://test.invalid',{},10),{name:'TypeError'});
    } finally {globalThis.fetch=original;}
});
