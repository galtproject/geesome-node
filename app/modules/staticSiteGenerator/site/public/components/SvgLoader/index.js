let mdSVGStore = {}

export default {
    name: 'SvgLoader',
    inject: ['store'],
    template: `<i class="svg-loader" v-html="html"></i>`,
    props: {
        src: {
            type: String,
            required: true
        }
    },
    data: () => ({
        html: null,
        error: null
    }),
    watch: {
        src() {
            this.html = null
            this.loadSVG()
        }
    },
    methods: {
        isSVG(mimetype) {
            return mimetype.indexOf('svg') >= 0
        },
        async setPlainHtml(htmlContent) {
            this.html = htmlContent;
            await this.$nextTick();
            this.$emit('md-loaded');
        },
        async setHtml() {
            if (mdSVGStore[this.src] && mdSVGStore[this.src].then) {
                mdSVGStore[this.src].then((html) => {
                    this.setPlainHtml(html);
                });
            } else if(mdSVGStore[this.src]) {
                this.setPlainHtml(mdSVGStore[this.src]);
            }
        },
        unexpectedError(reject) {
            this.error = `Something bad happened trying to fetch ${this.src}.`
            reject(this.error)
        },
        async loadSVGFromFs() {
            mdSVGStore[this.src] = this.store.assets[this.src];
            await this.setHtml();
        },
        loadSVG() {
            if (mdSVGStore.hasOwnProperty(this.src)) {
                return this.setHtml()
            }

            mdSVGStore[this.src] = new Promise((resolve, reject) => {
                const request = new window.XMLHttpRequest()

                request.open('GET', this.src, true)

                request.onload = () => {
                    const mimetype = request.getResponseHeader('content-type')

                    if (request.status === 200) {
                        if (this.isSVG(mimetype)) {
                            resolve(request.response)
                            this.setHtml()
                        } else {
                            this.error = `The file ${this.src} is not a valid SVG.`
                            reject(this.error)
                        }
                    } else if (request.status >= 400 && request.status < 500) {
                        this.error = `The file ${this.src} do not exists.`
                        reject(this.error)
                    } else {
                        this.unexpectedError(reject)
                    }
                }

                request.onerror = () => this.unexpectedError(reject)
                request.onabort = () => this.unexpectedError(reject)
                request.send()
            })
        }
    },
    mounted() {
        this.loadSVG()
    },
    created() {
        if (import.meta.url.indexOf('file:///') === 0) {
            this.loadSVGFromFs();
        }
    }
}