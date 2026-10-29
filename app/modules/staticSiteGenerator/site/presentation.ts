import {parseHtmlShell} from './htmlShell.js';

// This manifest is data for a closed renderer, never a component/CSS/script source.
export interface SitePresentation {
    schemaVersion: 1;
    template: {id: 'creator'; version: 1} | {id: 'html-shell'; version: 1; html: string};
    theme: {accent: string; background: string; surface: string; text: string; muted: string; border: string; accentBorder: string; accentSurface: string; accentText: string; badgeBackground: string; badgeText: string; radius: 'rounded' | 'square'; density: 'comfortable' | 'compact'; previewSize: 'standard' | 'compact' | 'large'};
    layout: {columns: 'sidebar' | 'single'; header: string[]; profile: string[]; sidebar: string[]; main: string[]; footer: string[]};
    copy: {join: string; subscribe: string; socialHeading: string; feedHeading: string; archiveHeading: string};
    membership: {ribbon: string[]; external?: {label: string; url: string; iconUrl?: string; accent: string}; benefits: {title: string; text: string}[]; banner?: {title: string; text: string}};
}
const defaults: SitePresentation = {
    schemaVersion: 1, template: {id:'creator',version:1},
    theme: {accent:'#5865f2',background:'#100e14',surface:'#1b1722',text:'#f5f3f7',muted:'#b7afbf',border:'#302a38',accentBorder:'#6e7aff',accentSurface:'#1e2134',accentText:'#d4d9ff',badgeBackground:'#d4d9ff',badgeText:'#202554',radius:'rounded',density:'comfortable',previewSize:'standard'},
    layout: {columns:'sidebar',header:['brand','account'],profile:['cover','profile'],sidebar:['membership','social-links'],main:['post-feed','pagination'],footer:['home','powered-by','legal-links']},
    copy: {join:'Join here',subscribe:'Join here to unlock',socialHeading:'Find me elsewhere',feedHeading:'Latest posts',archiveHeading:'Archive'},
    membership: {ribbon:[],benefits:[{title:'Archive access',text:'Access content during your membership period.'},{title:'No automatic renewal',text:'Pay once for your selected period. Renew whenever you want.'}]}
};
function invalid(): never { throw new Error('site_presentation_invalid'); }
function object(value: unknown, keys: string[]): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key))) {
        invalid();
    }
    return value as Record<string, any>;
}
function text(value: unknown, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.length>max || /[\u0000-\u001f]/.test(value)) {
        invalid();
    }
    return value.trim();
}
function color(value: unknown) {
    if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value)) {
        invalid();
    }
    return value.toLowerCase();
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
    if (!allowed.includes(value as T)) {
        invalid();
    }
    return value as T;
}
function blocks(value: unknown, allowed: string[], required: string[] = []) {
    if (!Array.isArray(value) || value.length>allowed.length || new Set(value).size!==value.length || value.some(item=>!allowed.includes(item)) || required.some(item=>!value.includes(item))) {
        invalid();
    }
    return [...value] as string[];
}
function external(value: unknown) {
    const input = object(value,['label','url','iconUrl','accent']);
    const url = text(input.url,2048);
    try {
        const parsed = new URL(url);
        if (parsed.protocol!=='https:' || parsed.username || parsed.password) {
            invalid();
        }
    } catch { invalid(); }
    if (input.iconUrl!==undefined && (typeof input.iconUrl!=='string' || !/^\/ipfs\/[A-Za-z0-9]{20,200}$/.test(input.iconUrl))) {
        invalid();
    }
    return {label:text(input.label,100),url,...(input.iconUrl ? {iconUrl:input.iconUrl} : {}),accent:input.accent===undefined ? '#e3e3e3' : color(input.accent)};
}
function message(value: unknown) {
    const input = object(value,['title','text']);
    return {title:text(input.title,100),text:text(input.text,500)};
}
/** Canonical bounded schema. Unknown fields and executable/styling sources fail closed. */
export function normalizeSitePresentation(value?: unknown): SitePresentation {
    const result: SitePresentation = JSON.parse(JSON.stringify(defaults));
    if (value===undefined) {
        return result;
    }
    const input = object(value,['schemaVersion','template','theme','layout','copy','membership']);
    if (input.schemaVersion!==1) {
        invalid();
    }
    if (input.template!==undefined) {
        const template = object(input.template,['id','version','html']);
        if (!['creator','html-shell'].includes(template.id) || template.version!==1) {
            invalid();
        }
    }
    if (input.template?.id === 'html-shell') {
        parseHtmlShell(input.template.html);
        result.template={id:'html-shell',version:1,html:input.template.html.trim()};
    } else if (input.template?.html !== undefined) {
        invalid();
    }
    if (input.theme!==undefined) {
        const theme = object(input.theme,Object.keys(defaults.theme));
        for (const key of ['accent','background','surface','text','muted','border','accentBorder','accentSurface','accentText','badgeBackground','badgeText'] as const) {
            if (theme[key]!==undefined) {
                result.theme[key]=color(theme[key]);
            }
        }
        if (theme.accent!==undefined) {
            const derived={accentBorder:result.theme.accent,accentSurface:result.theme.surface,accentText:result.theme.text,badgeBackground:result.theme.accent,badgeText:presentationForeground(result.theme.accent)};
            for (const key of ['accentBorder','accentSurface','accentText','badgeBackground','badgeText'] as const) {
                if (theme[key]===undefined) {
                    result.theme[key]=derived[key];
                }
            }
        }
        if (theme.radius!==undefined) {
            result.theme.radius=choice(theme.radius,['rounded','square']);
        }
        if (theme.previewSize!==undefined) {
            result.theme.previewSize=choice(theme.previewSize,['standard','compact','large']);
        }
        if (theme.density!==undefined) {
            result.theme.density=choice(theme.density,['comfortable','compact']);
        }
    }
    if (input.layout!==undefined) {
        const layout = object(input.layout,Object.keys(defaults.layout));
        if (layout.columns!==undefined) {
            result.layout.columns=choice(layout.columns,['sidebar','single']);
        }
        for (const region of ['header','profile','sidebar','main','footer'] as const) {
            if (layout[region]!==undefined) {
                const required = region==='header' ? ['brand','account'] : region==='profile' ? ['profile'] : region==='main' ? ['post-feed','pagination'] : region==='footer' ? ['home'] : [];
                result.layout[region]=blocks(layout[region],defaults.layout[region],required);
            }
        }
    }
    if (input.copy!==undefined) {
        const copy=object(input.copy,Object.keys(defaults.copy));
        for (const key of Object.keys(defaults.copy) as (keyof SitePresentation['copy'])[]) {
            if (copy[key]!==undefined) {
                result.copy[key]=text(copy[key],100);
            }
        }
    }
    if (input.membership!==undefined) {
        const membership=object(input.membership,['ribbon','external','benefits','banner']);
        if (membership.ribbon!==undefined) {
            if (!Array.isArray(membership.ribbon) || membership.ribbon.length>2) {
                invalid();
            }
            result.membership.ribbon=membership.ribbon.map(line=>text(line,60));
        }
        if (membership.external!==undefined) {
            result.membership.external=external(membership.external);
        }
        if (membership.banner!==undefined) {
            result.membership.banner=message(membership.banner);
        }
        if (membership.benefits!==undefined) {
            if (!Array.isArray(membership.benefits) || membership.benefits.length>6) {
                invalid();
            }
            result.membership.benefits=membership.benefits.map(message);
        }
    }
    return result;
}

/** Only normalized hexadecimal values enter the stylesheet. */
export function sitePresentationCss(value?: unknown) {
    const {theme} = normalizeSitePresentation(value);
    return ':root{--site-accent-foreground:' + presentationForeground(theme.accent) + ';' + Object.entries(theme).filter(([key])=>!['radius','density','previewSize'].includes(key)).map(([key,value])=>`--site-${key}:${value}`).join(';') + '}';
}
export function presentationForeground(hex: string) {
    const rgb = [1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(value=>value<=0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722>0.179 ? '#16121b' : '#ffffff';
}
