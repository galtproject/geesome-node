import { ref, nextTick, onMounted, onBeforeUnmount, type Ref } from 'vue';
import type { PreviewMedia } from './types.ts';
export function useMembershipModal(error: Ref<string>) {
    const modal = ref(''), gallery = ref<PreviewMedia[]>([]), imageIndex = ref(0);
    let savedFocus: HTMLElement | null = null, previousBodyOverflow = '';
    function closeModal() {
        modal.value = '';
        gallery.value = [];
        error.value = '';
        document.body.style.overflow = previousBodyOverflow;
        savedFocus?.focus();
    }
    async function openModal(name: string) {
        if (!modal.value) {
            savedFocus = document.activeElement as HTMLElement;
            previousBodyOverflow = document.body.style.overflow;
        }
        modal.value = name;
        error.value = '';
        document.body.style.overflow = 'hidden';
        await nextTick();
        (document.querySelector('.membership-modal button, .membership-modal input') as HTMLElement)?.focus();
    }
    function keydown(event: KeyboardEvent) {
        if (!modal.value) {
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
        }
        if (modal.value === 'gallery' && event.key === 'ArrowRight') {
            imageIndex.value = (imageIndex.value + 1) % gallery.value.length;
        }
        if (modal.value === 'gallery' && event.key === 'ArrowLeft') {
            imageIndex.value = (imageIndex.value + gallery.value.length - 1) % gallery.value.length;
        }
        if (event.key === 'Tab') {
            const nodes = Array.from(document.querySelectorAll<HTMLElement>('.membership-modal button:not([disabled]), .membership-modal a[href], .membership-modal input, .membership-modal textarea, .membership-modal select'));
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }
    }
    onMounted(() => document.addEventListener('keydown', keydown));
    onBeforeUnmount(() => {
        document.removeEventListener('keydown', keydown);
        if (modal.value) {
            document.body.style.overflow = previousBodyOverflow;
        }
    });
    return { modal, gallery, imageIndex, closeModal, openModal };
}
