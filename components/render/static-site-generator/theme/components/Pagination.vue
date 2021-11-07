<template>
  <div class="pagination">
    <a :href="baseHref + page.number" v-for="page in pagesButtons"
       :class="{'current': page.number == currentPage && page.type === 'regular'}">
      <span v-if="page.type === 'regular'">{{ page.number }}</span>
      <span v-if="page.type === 'dots'">...</span>
      <span v-if="page.type === 'prev'">Prev</span>
      <span v-if="page.type === 'next'">Next</span>
    </a>
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
    methods: {},
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

        if (this.onlyRegular || this.pagesCount > this._displayPagesAfter) {
          return Array.from(Array(this.pagesCount).keys()).map(i => {
            return {
              number: i + 1,
              type: 'regular'
            }
          });
        }

        let groupSizeBefore = this._displayPagesBefore;
        let groupSizeAfter = this._displayPagesAfter;
        let currentGroup = Math.ceil(this.currentPage / groupSizeBefore);

        // let lastGroup = Math.ceil(this.pagesCount / groupSizeBefore);
        // if(currentGroup === lastGroup) {
        //     currentGroup--;
        // }

        let lastPage = currentGroup === 1 ? 1 : (currentGroup - 1) * groupSizeBefore;

        let currentPage = lastPage;

        if (this.showEdges) {
          pages.push({
            number: 1,
            type: 'first',
            disabled: this.currentPage == 1
          });
        }

        if (lastPage != 1) {
          pages.push({
            number: lastPage,
            type: 'dots'
          });
          currentPage++;
        }

        lastPage = currentPage;

        for (; currentPage - lastPage < groupSizeBefore && currentPage <= this.pagesCount; currentPage++) {
          pages.push({
            number: currentPage,
            type: 'regular'
          });
        }

        if (this.pagesCount > currentPage) {
          const restPagesCount = this.pagesCount - currentPage;

          if (restPagesCount > groupSizeAfter) {
            pages.push({
              number: currentPage,
              type: 'dots'
            });

            currentPage = this.pagesCount - groupSizeAfter + 1;
          }

          lastPage = currentPage;

          for (; currentPage - lastPage < groupSizeAfter; currentPage++) {
            pages.push({
              number: currentPage,
              type: 'regular'
            });
          }
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
        return _.includes(this.currentHref, 'page') ? parseInt(_.last(this.currentHref.split('/'))) : 1;
      }
    },
  }
</script>