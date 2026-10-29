import {CID} from 'multiformats/cid';
import {parseFragment, type DefaultTreeAdapterMap} from 'parse5';

export type ShellNode = {text: string} | {slot: string} | {tag: string; attrs: Record<string, string>; children: ShellNode[]};
export const shellSlots = ['brand','account','cover','profile','membership','social-links','posts','pagination','footer'] as const;
export const shellClasses = ['container','grid','sidebar-left','sidebar-right','single-column','stack','row','gap-sm','gap-md','gap-lg','panel','text-muted','text-center'] as const;
const containers = ['div','section','header','footer','main','aside','nav'];
const phrasing = ['span','strong','em','br','a','img'];
const tags = [...containers,...phrasing,'h1','h2','h3','p'];
export class HtmlShellValidationError extends Error {
    constructor(public reason: string) {
        super('site_presentation_invalid');
    }
}
function invalid(reason = 'html_not_allowed'): never {
    throw new HtmlShellValidationError(reason);
}
function checkText(value: string) {
    const remaining = value.replace(/\{\{(site\.title|site\.description)}}/g,'');
    if (remaining.includes('{{') || remaining.includes('}}')) {
        invalid('unknown_placeholder');
    }
}
/** HTML is parsed only as data. No owner source reaches a compiler or innerHTML. */
export function parseHtmlShell(source: unknown): ShellNode[] {
    if (typeof source !== 'string' || !source.trim() || source.length > 32768 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) {
        invalid('source_invalid_or_too_large');
    }
    const htmlSource=source;
    let parseError = false;
    const root = parseFragment(source,{sourceCodeLocationInfo:true,onParseError:()=>{parseError=true;}});
    if (parseError) {
        invalid('html_parse_error');
    }
    const seen = new Set<string>();
    let count = 0;
    let substitutions = 0;
    function boundedText(value: string) {
        checkText(value);
        substitutions += (value.match(/\{\{(site\.title|site\.description)}}/g) || []).length;
        if (substitutions > 32) {
            invalid('placeholder_limit_exceeded');
        }
    }
    const spans: {startOffset:number;endOffset:number}[] = [];
    function walk(node: DefaultTreeAdapterMap['childNode'], depth: number, inline = false, inLink = false): ShellNode {
        count++;
        if (depth > 24 || count > 512) {
            invalid('tree_limit_exceeded');
        }
        if (node.nodeName === '#text' && 'value' in node) {
            const location=node.sourceCodeLocation;
            if (!location || htmlSource.slice(location.startOffset,location.endOffset).includes('<')) {
                invalid();
            }
            spans.push(location);
            boundedText(node.value);
            return {text:node.value};
        }
        if (!('tagName' in node) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
            invalid();
        }
        const {tagName:tag,sourceCodeLocation:loc} = node;
        // Reject browser repairs, implicit closes and unsupported/self-closing containers.
        if (!loc?.startTag || (!['img','br'].includes(tag) && !loc.endTag)) {
            invalid();
        }
        spans.push(loc.startTag);
        if (loc.endTag) {
            spans.push(loc.endTag);
        }
        if (tag === 'geesome-slot') {
            const name = node.attrs[0]?.value;
            if (inline || node.attrs.length !== 1 || node.attrs[0].name !== 'name' || !shellSlots.includes(name as typeof shellSlots[number]) || seen.has(name) || node.childNodes.length) {
                invalid();
            }
            seen.add(name);
            return {slot:name};
        }
        if (!tags.includes(tag) || (inline && !phrasing.includes(tag)) || (inLink && tag === 'a')) {
            invalid('tag_or_nesting_not_allowed');
        }
        const attrs: Record<string,string> = {};
        for (const attr of node.attrs) {
            const {name,value} = attr;
            if (attr.namespace || !['class','title',...(tag === 'a' ? ['href'] : []),...(tag === 'img' ? ['src','alt'] : [])].includes(name)) {
                invalid();
            }
            if (name === 'class') {
                const classes = value.split(/\s+/).filter(Boolean);
                if (!classes.length || classes.some(c=>!shellClasses.includes(c as typeof shellClasses[number])) || new Set(classes).size !== classes.length) {
                    invalid();
                }
                attrs.class = classes.map(c=>'shell-'+c).join(' ');
            } else if (name === 'href' || name === 'src') {
                // Whole typed URLs only: private data can never be concatenated into an external URL.
                if (name === 'src' && ['{{site.avatarUrl}}','{{site.coverUrl}}'].includes(value)) {
                    attrs[name]=value;
                    continue;
                }
                if (value.includes('{{') || value.includes('}}') || /[\s\\]/.test(value)) {
                    invalid();
                }
                const ipfs = /^\/ipfs\/[A-Za-z0-9]{20,200}(?:\/[A-Za-z0-9._~-]+)*\/?$/.test(value) && !value.split('/').some(part=>part === '.' || part === '..');
                if (ipfs) {
                    try {
                        CID.parse(value.split('/')[2]);
                    } catch {
                        invalid();
                    }
                }
                if (!ipfs) {
                    if (name === 'src') {
                        invalid();
                    }
                    try {
                        const url = new URL(value);
                        if (url.protocol !== 'https:' || url.username || url.password) {
                            invalid();
                        }
                    } catch {
                        invalid();
                    }
                }
                attrs[name]=value;
            } else {
                if (value.length > 500) {
                    invalid();
                }
                boundedText(value);
                attrs[name]=value;
            }
        }
        if ((tag === 'a' && !attrs.href) || (tag === 'img' && (!attrs.src || attrs.alt === undefined))) {
            invalid();
        }
        if (tag === 'a') {
            attrs.rel='noopener noreferrer';
        }
        if (tag === 'img') {
            attrs.loading='lazy';
        }
        return {tag,attrs,children:node.childNodes.map(child=>walk(child,depth+1,inline || !containers.includes(tag),inLink || tag === 'a'))};
    }
    const nodes = root.childNodes.map(node=>walk(node,0));
    // HTML parsers may silently discard document tags or unmatched closes.
    // Require every source token to belong to the validated tree.
    let offset=0;
    for (const span of spans.sort((a,b)=>a.startOffset-b.startOffset)) {
        if (span.startOffset !== offset) {
            invalid();
        }
        offset=span.endOffset;
    }
    if (offset !== source.length) {
        invalid();
    }
    for (const required of ['brand','account','profile','membership','posts','pagination','footer']) {
        if (!seen.has(required)) {
            invalid('missing_slot_'+required);
        }
    }
    return nodes;
}

export function shellText(value: string, site: {title?: string; description?: string}) {
    return value.replace(/\{\{(site\.title|site\.description)}}/g,(_match,key)=>String(key === 'site.title' ? site.title || '' : site.description || ''));
}

/** Retain linked IPFS assets without fetching or walking referenced directories. */
export function htmlShellAssets(source: string): string[] {
    const assets = new Set<string>();
    function visit(node: ShellNode) {
        if ('tag' in node) {
            for (const key of ['src','href']) {
                if (node.attrs[key]?.startsWith('/ipfs/')) {
                    assets.add(node.attrs[key]);
                }
            }
            node.children.forEach(visit);
        }
    }
    parseHtmlShell(source).forEach(visit);
    return [...assets];
}
