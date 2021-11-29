<template>
  <div class="blog-tags">
    <block-tag v-for="tag in tags" :key="tag.name" :tag="tag" />
  </div>
</template>

<script>
import BlockTag from './BlockTag';
export default {
  props: ['tags'],
  components: { BlockTag },
}
</script>