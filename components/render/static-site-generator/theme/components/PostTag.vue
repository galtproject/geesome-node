<template>
  <li class="post-tag">
    <router-link :to="'/tag/' + tag">
      <span>{{ tag }}</span>
    </router-link>
  </li>
</template>

<script>
export default {
  name: 'PostTag',
  props: {
    tag: {
      type: String,
      required: true,
    },
  },
}
</script>