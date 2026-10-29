import {computed, defineComponent, h, type PropType, type VNodeChild} from 'vue';
import {parseHtmlShell, shellText, type ShellNode} from '../../htmlShell.js';
import {safeSiteUrl} from './api.ts';

/** Runtime VNodes from a closed grammar; owner HTML is never a Vue template. */
export default defineComponent({
    props: {
        html: {type:String,required:true},
        site: {type:Object as PropType<{title?:string; description?:string; avatarUrl?:string; coverUrl?:string}>,required:true},
    },
    setup(props,{slots}) {
        const nodes=computed(()=>parseHtmlShell(props.html));
        function render(node: ShellNode): VNodeChild {
            if ('text' in node) {
                return shellText(node.text,props.site);
            }
            if ('slot' in node) {
                return slots[node.slot]?.();
            }
            const attrs={...node.attrs};
            if (node.tag === 'a' || node.tag === 'img') {
                attrs.class=[attrs.class,node.tag === 'a' ? 'shell-link' : 'shell-image'].filter(Boolean).join(' ');
            }
            for (const key of ['alt','title']) {
                if (attrs[key] !== undefined) {
                    attrs[key]=shellText(attrs[key],props.site);
                }
            }
            if (attrs.src === '{{site.avatarUrl}}' || attrs.src === '{{site.coverUrl}}') {
                const value=attrs.src === '{{site.avatarUrl}}' ? props.site.avatarUrl : props.site.coverUrl;
                const src=safeSiteUrl(value);
                if (!src) {
                    return null;
                }
                attrs.src=src;
            }
            return h(node.tag,attrs,node.children.map(render));
        }
        return ()=>h('div',{class:'owner-shell','data-testid':'html-shell'},nodes.value.map(render));
    },
});
