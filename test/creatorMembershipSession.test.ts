import assert from 'node:assert/strict';
import {createRenderer, defineComponent} from 'vue';
import {useMembershipSession} from '../app/modules/staticSiteGenerator/site/public/creator/useMembershipSession.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('membership access changes from a mounted static website', () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    let app;
    beforeEach(() => {
        Object.defineProperty(globalThis, 'document', {configurable:true,value:{
            body:{style:{overflow:''}}, activeElement:null, addEventListener() {}, removeEventListener() {}, querySelector:()=>null,
        }});
    });
    afterEach(() => {
        app?.unmount();
        app = null;
        globalThis.fetch = originalFetch;
        if (originalLocation) {
            Object.defineProperty(globalThis, 'location', originalLocation);
        } else {
            delete globalThis.location;
        }
        if (originalDocument) {
            Object.defineProperty(globalThis, 'document', originalDocument);
        } else {
            delete globalThis.document;
        }
    });
    for (const [path, entryPath] of [
        ['/', '/api/v1/membership/site/'],
        ['/posts/42/', '/api/v1/membership/site/posts/42/'],
        ['/account/', '/api/v1/membership/site/account/'],
    ]) {
        it(`uses the entitlement selector after sign-in and logout on ${path}`, async () => {
            let signedIn = false;
            const navigations: string[] = [];
            Object.defineProperty(globalThis, 'location', {configurable:true,value:{pathname:path,assign:url=>navigations.push(url)}});
            globalThis.fetch = async url => {
                const route = String(url);
                if (route.includes('/login/google') && !route.includes('/challenge')) {
                    signedIn = true;
                }
                if (route.includes('/logout')) {
                    signedIn = false;
                }
                return Response.json(route.includes('/account') && signedIn
                    ? {reader:{id:'reader'},active:true,invoices:[]} : {reader:null});
            };
            const renderer = createRenderer({
                createComment:()=>({}), createText:()=>({}), createElement:()=>({}),
                insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
                parentNode:()=>null, nextSibling:()=>null,
            });
            let session: ReturnType<typeof useMembershipSession>;
            app = renderer.createApp(defineComponent({setup() {
                session = useMembershipSession({resource:{id:'creator',title:'Creator',postsEnabled:true},posts:[],nextOffset:null,path,
                    snapshot:{full:false,canonicalPath:path,homePath:'./',accountPath:'account/',entryPath}});
                return ()=>null;
            }}));
            app.mount({});
            await flush();
            assert.deepEqual(navigations, []);
            await session.login('test-credential');
            assert.equal(session.active.value,true);
            assert.deepEqual(navigations,[entryPath], 'the static domain URL cannot select full content');
            await session.logout();
            assert.equal(session.active.value,false);
            assert.deepEqual(navigations,[entryPath,entryPath], 'logout resolves the public snapshot');
        });
    }
    it('celebrates a new payment during checkout after the full snapshot loads, without replay on reload', async () => {
        const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
        const values = new Map();
        Object.defineProperty(globalThis, 'sessionStorage', {configurable:true,value:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}});
        let paid = false;
        const navigations: string[] = [];
        Object.defineProperty(globalThis, 'location', {configurable:true,value:{assign:url=>navigations.push(url)}});
        globalThis.fetch = async () => Response.json({reader:{id:'reader'},active:paid,expiresAt:'2030-01-01T00:00:00Z',invoices:[{id:'payment',status:paid?'paid':'pending',provider:'direct'}]});
        function mount(full) {
            let session: ReturnType<typeof useMembershipSession>;
            const renderer = createRenderer({createComment:()=>({}),createText:()=>({}),createElement:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode:()=>null,nextSibling:()=>null});
            app = renderer.createApp(defineComponent({setup(){session=useMembershipSession({resource:{id:'wave',title:'Wave',postsEnabled:true},posts:[],nextOffset:null,path:'/',snapshot:{full,homePath:'./',accountPath:'account/',entryPath:'/selector/'}});return()=>null;}}));
            app.mount({});
            return session!;
        }
        try {
            const publicSession = mount(false); await flush();
            publicSession.modal.value = 'checkout'; paid = true;
            await publicSession.confirmPayment();
            assert.deepEqual(navigations,['/selector/']);
            app.unmount(); app=null;
            const fullSession = mount(true); await flush(); await flush();
            assert.equal(fullSession.modal.value,'activated');
            fullSession.closeModal();
            await fullSession.refreshAccess();
            assert.equal(fullSession.modal.value,'');
            app.unmount(); app=null;
            const reload = mount(true); await flush();
            assert.equal(reload.modal.value,'');
        }
        finally {
            if (originalStorage) {
                Object.defineProperty(globalThis,'sessionStorage',originalStorage);
            }
            else {
                delete globalThis.sessionStorage;
            }
        }
    });

});
