<template>
  <div class="pagination">
    <span v-for="page in pagesButtons">
      <span v-if="page.type === 'dots'">...</span>
      <a v-else :href="baseHref + page.number" :class="{'current': page.number === currentPage}">
        <span v-if="page.type === 'regular'">{{ page.number }}</span>
        <span v-if="page.type === 'prev'">Prev</span>
        <span v-if="page.type === 'next'">Next</span>
      </a>
    </span>
  </div>
</template>

<script>
  const _ = require('lodash');

  export default {
    name: 'pagination',
    props: ['onlyRegular', 'prevNext', 'baseHref', 'pagesCount', 'currentHref', 'displayPages', 'displayPagesBefore', 'displayPagesAfter', 'showEdges'],
    created() {
    },
    watch: {},
    methods: {
    },
    computed: {
      _displayPagesBefore() {
        return this.displayPagesBefore || Math.round(this.displayPages / 2);
      },
      _displayPagesAfter() {
        return this.displayPagesAfter || Math.round(this.displayPages / 2);
      },
      pagesButtons() {
        const pages = [];

        if (this.prevNext) {
          if (this.currentPage !== 1) {
            pages.push({
              type: 'prev',
              number: this.currentPage - 1
            })
          }
          if (this.currentPage !== this.pagesCount) {
            pages.push({
              type: 'next',
              number: this.currentPage + 1
            })
          }
          return pages;
        }

        if (this.onlyRegular || this.displayPages >= this.pagesCount) {
          return Array.from(Array(this.pagesCount).keys()).map(i => {
            return {
              number: i + 1,
              type: 'regular'
            }
          });
        }

        let groupSizeBefore = this._displayPagesBefore;
        let groupSizeAfter = this._displayPagesAfter;

        for (let i = 1; i <= groupSizeBefore; i++) {
          pages.push({
            number: i,
            type: 'regular'
          });
        }

        pages.push({
          number: this.pagesCount - groupSizeAfter,
          type: 'dots'
        });

        for (let i = this.pagesCount - groupSizeAfter + 1; i <= this.pagesCount; i++) {
          pages.push({
            number: i,
            type: 'regular'
          });
        }

        if (this.showEdges) {
          pages.push({
            number: this.pagesCount,
            type: 'last',
            disabled: this.currentPage == this.pagesCount
          });
        }

        return pages;
      },
      currentPage() {
        return _.includes(this.currentHref, 'page') ? parseInt(_.last(_.trim(this.currentHref, '/').split('/'))) : 1;
      }
    },
  }
</script>