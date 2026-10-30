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
            body:{style:{overflow:''}}, activeElement:null, addEventListener() {}, removeEventListener() {},
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
});
