import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createGalleryImageLoader} from '../app/modules/staticSiteGenerator/site/public/pages/ContentList/imageLoader.js';

function fixture(t) {
    const images = [];
    class Image {
        constructor() {
            images.push(this);
        }
        removeAttribute() {
            this.src = null;
        }
    }
    const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
    Object.defineProperty(globalThis, 'Image', {value: Image, configurable: true});
    t.after(() => {
        if (originalImage) {
            Object.defineProperty(globalThis, 'Image', originalImage);
        } else {
            delete globalThis.Image;
        }
    });
    t.mock.timers.enable({apis: ['setTimeout']});
    const shown = [], errors = [];
    const loader = createGalleryImageLoader([
        {preview: 'preview.webp', original: 'original.jpg'},
    ], (index, url) => shown.push({index, url}), index => errors.push(index));
    t.after(() => loader.dispose());
    return {images, shown, errors, loader};
}

test('hung requests have a bounded timeout and manual retry recovers both failed renditions', t => {
    const {loader, images, shown, errors} = fixture(t);
    loader.setVisible([0]);
    t.mock.timers.tick(15000);
    assert.equal(images[0].src, null, 'timed out request is cancelled');
    t.mock.timers.tick(500);
    t.mock.timers.tick(15000);
    t.mock.timers.tick(1000);
    t.mock.timers.tick(15000);
    assert.equal(images.length, 4, 'three preview attempts then one original');
    assert.equal(images[3].src, 'original.jpg');
    t.mock.timers.tick(15000);
    assert.deepEqual(errors, [0]);
    t.mock.timers.tick(60000);
    assert.equal(images.length, 4, 'exhausted requests do not loop');
    loader.retry(0);
    images[4].onload();
    assert.deepEqual(shown, [{index: 0, url: 'preview.webp'}]);
});

test('a scheduled preview retry waits until its card is visible again', t => {
    const {loader, images} = fixture(t);
    loader.setVisible([0]);
    images[0].onerror();
    loader.setVisible([]);
    t.mock.timers.tick(500);
    assert.equal(images.length, 1);
    loader.setVisible([0]);
    assert.equal(images.length, 2);
    images[1].onerror();
    loader.dispose();
    t.mock.timers.tick(60000);
    assert.equal(images.length, 2, 'disposal cancels retry timers');
});

test('disposal cancels pending image requests and prevents late callbacks', t => {
    const {loader, images, shown, errors} = fixture(t);
    loader.setVisible([0]);
    const lateLoad = images[0].onload;
    loader.dispose();
    assert.equal(images[0].src, null);
    assert.equal(images[0].onload, null);
    lateLoad();
    t.mock.timers.tick(60000);
    loader.setVisible([0]);
    assert.deepEqual(shown, []);
    assert.deepEqual(errors, []);
    assert.equal(images.length, 1);
});
