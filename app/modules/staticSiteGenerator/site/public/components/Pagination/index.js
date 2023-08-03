import {getRelativeRoot} from "../../helpers.js";

export default {
    name: 'pagination',
    props: ['onlyRegular', 'prevNext', 'pagesCount', 'currentHref', 'displayPages', 'displayPagesBefore', 'displayPagesAfter', 'showEdges', 'reverse'],
    created() {
    },
    watch: {},
    methods: {},
    computed: {
        baseHref() {
            return getRelativeRoot(this.$route.path);
        },
        basePageHref() {
            return this.baseHref + 'page/';
        },
        curPage() {
            return parseInt(this.$route.params.page || this.pagesCount);
        },
        _displayPagesBefore() {
            return this.displayPagesBefore || Math.round(this.displayPages / 2);
        },
        _displayPagesAfter() {
            return this.displayPagesAfter || Math.round(this.displayPages / 2);
        },
        pagesButtons() {
            let pages = [];

            if (this.prevNext) {
                if (this.curPage !== 1) {
                    pages.push({
                        type: 'prev',
                        number: this.curPage - 1
                    })
                }
                if (this.curPage !== this.pagesCount) {
                    pages.push({
                        type: 'next',
                        number: this.curPage + 1
                    })
                }
                return pages;
            }

            if (this.onlyRegular || this.displayPages >= this.pagesCount) {
                pages = Array.from(Array(this.pagesCount).keys()).map(i => {
                    return {
                        number: i + 1,
                        type: 'regular'
                    }
                });
                return this.reverse ? pages.reverse() : pages;
            }

            let groupSizeBefore = this._displayPagesBefore;
            let groupSizeAfter = this._displayPagesAfter;

            let groupSizeMiddle = 0;
            if (this.curPage >= groupSizeBefore && this.curPage <= this.pagesCount - groupSizeAfter) {
                groupSizeBefore = Math.floor(groupSizeBefore / 2);
                groupSizeAfter = groupSizeBefore;
                groupSizeMiddle = this.displayPages - groupSizeBefore - groupSizeAfter;
            }

            for (let i = 1; i <= groupSizeBefore; i++) {
                pages.push({
                    number: i,
                    type: 'regular'
                });
            }

            const groupAfterStartPosition = () => {
                let position = this.pagesCount - groupSizeAfter + 1;
                // if (position === this.curPage) {
                //   position--;
                // }
                return position;
            }

            if (groupSizeMiddle) {
                const curPagePosition = Math.floor(groupSizeMiddle / 2);
                let middleGroupStartNumber = this.curPage - curPagePosition;
                if (middleGroupStartNumber <= groupSizeBefore) {
                    middleGroupStartNumber = groupSizeBefore + 2;
                }
                pages.push({
                    number: middleGroupStartNumber - 1,
                    type: 'dots'
                });
                let middleGroupFinishNumber = middleGroupStartNumber + groupSizeMiddle;
                if (middleGroupFinishNumber >= groupAfterStartPosition()) {
                    middleGroupFinishNumber = groupAfterStartPosition() - 1;
                }
                for (let i = middleGroupStartNumber; i <= middleGroupFinishNumber; i++) {
                    pages.push({
                        number: i,
                        type: 'regular'
                    });
                }
            }

            pages.push({
                number: groupAfterStartPosition() - 1,
                type: 'dots'
            });

            for (let i = groupAfterStartPosition(); i <= this.pagesCount; i++) {
                pages.push({
                    number: i,
                    type: 'regular'
                });
            }

            if (this.showEdges) {
                pages.push({
                    number: this.pagesCount,
                    type: 'last',
                    disabled: this.curPage == this.pagesCount
                });
            }

            return this.reverse ? pages.reverse() : pages;
        },
    },
    template: `
      <div class="pagination">
          <span v-for="page in pagesButtons">
          <a :href="page.number === pagesCount ? baseHref : basePageHref + page.number + '/'" :class="{'current': page.number === curPage}">
            <span v-if="page.type === 'dots'">...</span>
            <span v-if="page.type === 'regular'">{{ page.number }}</span>
            <span v-if="page.type === 'prev'">Prev</span>
            <span v-if="page.type === 'next'">Next</span>
          </a>
        </span>
      </div>
    `
}