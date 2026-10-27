import { defineComponent, h, ref, onMounted } from 'vue';
export const PreviewImage = defineComponent({
    props: { src: { type: String, required: true }, alt: { type: String, required: true }, retry: { type: Boolean, default: false } },
    setup(props) {
        const status = ref('loading'), attempt = ref(0), image = ref<HTMLImageElement | null>(null);
        onMounted(() => { if (image.value?.complete) {
            status.value = image.value.naturalWidth > 0 ? 'loaded' : 'error';
        } });
        return () => h('div', { class: ['preview-image-state', `image-${status.value}`] }, [
            h('img', { ref: image, key: attempt.value, src: props.src + (attempt.value ? (props.src.includes('?') ? '&' : '?') + `previewRetry=${attempt.value}` : ''), alt: props.alt, loading: 'lazy', onLoad: () => status.value = 'loaded', onError: () => status.value = 'error' }),
            status.value === 'loading' ? h('span', { class: 'image-status', role: 'status' }, 'Loading preview…') : null,
            status.value === 'error' ? h('div', { class: 'image-status', role: 'status' }, ['Preview could not load.', props.retry ? h('button', { type: 'button', onClick: () => { status.value = 'loading'; attempt.value++; }, 'data-testid': 'retry-preview' }, 'Retry image') : null]) : null,
        ]);
    },
});
