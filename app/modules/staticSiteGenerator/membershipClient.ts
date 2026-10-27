// Static snapshots contain no reader identity or owner credentials. Account
// controls use the existing nonce/session/payments APIs on the creator domain.
export const membershipClient = String.raw`(() => {
'use strict';
const base = '/api/v1';
const panel = document.querySelector('#membership-panel');
const output = panel.querySelector('[role=status]');
let invoice = null, poll = null, pending = null;
function refresh() {
    location.assign(document.querySelector('main').dataset.siteEntry || '/api/v1/membership/site/');
}
async function api(path, body) {
    const response = await fetch(base + path, {
        credentials: 'same-origin', cache: 'no-store', method: body ? 'POST' : 'GET',
        headers: body ? {'content-type': 'application/json'} : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const value = await response.json();
    if (!response.ok) {
        throw Error(value.code || 'Request failed');
    }
    return value;
}
function say(value) { output.textContent = value; }
function stopPolling() {
    if (poll) {
        clearInterval(poll);
        poll = null;
    }
}
function terminal(value) {
    return ['expired', 'failed', 'cancelled', 'refunded'].includes(value.status);
}
function button(label, action) {
    const item = document.createElement('button');
    item.type = 'button'; item.textContent = label;
    item.onclick = async () => {
        item.disabled = true;
        try { await action(); } catch (error) { say(error.message); } finally { item.disabled = false; }
    };
    panel.append(item);
    return item;
}
function select(values, label) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const element = document.createElement('select');
    for (const value of values) {
        const option = document.createElement('option');
        option.value = value.id; option.textContent = value.label; element.append(option);
    }
    wrapper.append(element); panel.append(wrapper);
    return element;
}
function showInvoice(value) {
    invoice = value.id;
    if (terminal(value)) {
        pending = null;
        stopPolling();
    }
    say(value.status + ' — Send exactly ' + value.amount + ' ' + value.currency + ' on ' + value.network
        + ' to ' + value.address + '; quote expires ' + value.expiresAt + '. Received: ' + value.received);
}
async function googleLogin() {
    const challenge = await api('/login/google/challenge');
    await new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client'; script.onload = resolve;
        script.onerror = () => reject(Error('Google sign-in could not load'));
        document.head.append(script);
    });
    const target = document.createElement('div'); panel.append(target);
    window.google.accounts.id.initialize({client_id: challenge.googleClientId, nonce: challenge.nonce,
        callback: async ({credential}) => {
            try { await api('/login/google', {credential}); refresh(); } catch (error) { say(error.message); }
        }
    });
    window.google.accounts.id.renderButton(target, {theme: 'outline', size: 'large'});
}
async function open() {
    stopPolling(); panel.hidden = false;
    panel.querySelectorAll('button,label,div').forEach(item => item.remove());
    say('Loading…');
    const [account, resource] = await Promise.all([api('/membership/account'), api('/membership/resource')]);
    if (!account.reader) {
        say('Sign in to subscribe or view your existing subscription.');
        button('Sign in with Google', googleLogin);
        return;
    }
    say(account.active ? 'Subscription active until ' + account.expiresAt : 'No active subscription.');
    button('Sign out', async () => { await api('/browser-session/logout', {}); refresh(); });
    const methods = (await api('/payments/crypto/methods')).methods.filter(item => item.available);
    if (!methods.length || !resource.options.length) {
        button('Close', () => { panel.hidden = true; });
        return;
    }
    const tariff = select(resource.options.map(item => ({id: item.id,
        label: item.label + ' — ' + (item.amountCents / 100).toFixed(2) + ' ' + item.currency})), 'Subscription ');
    const method = select(methods.map(item => ({id: item.id, label: item.currency + ' — ' + item.networkLabel})), 'Payment network ');
    button('Create payment invoice', async () => {
        const key = tariff.value + ':' + method.value;
        if (!pending || pending.key !== key) {
            pending = {key, id: crypto.randomUUID()};
        }
        // Keep this key on an ambiguous response; clear it only for a known
        // terminal invoice so a new quote can be explicitly requested.
        const created = await api('/payments/crypto/invoices', {optionId: tariff.value, assetId: method.value, idempotencyKey: pending.id});
        showInvoice(created);
        if (terminal(created)) {
            return;
        }
        stopPolling();
        poll = setInterval(async () => {
            try {
                const current = await api('/payments/crypto/invoices/' + encodeURIComponent(invoice));
                showInvoice(current);
                if (current.status === 'paid') {
                    stopPolling(); refresh();
                }
            } catch (error) { say(error.message); }
        }, 5000);
    });
    button('Close', () => { panel.hidden = true; stopPolling(); });
}
document.querySelector('#membership-open').onclick = () => open().catch(error => say(error.message));
window.addEventListener('pagehide', stopPolling);
})();`;
