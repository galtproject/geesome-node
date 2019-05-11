const base58 = require('./base58');

const treeLib = {
    setNode(trie, id, node) {
        id = base58.encode(id);
        const treePath = treeLib.getTreePath(id);
        console.log(treePath.join('/'));

        let parentNode = trie;
        treePath.forEach((treePathItem) => {
            if(treePathItem.indexOf('_') == -1) {
                parentNode[treePathItem] = node;
            } else {
                if(!parentNode[treePathItem]) {
                    parentNode[treePathItem] = {};
                }
                parentNode = parentNode[treePathItem];
            }
        });
    },
    
    getNode(tree, id) {
        id = base58.encode(id);
        const treePath = treeLib.getTreePath(id);
        let curNode = tree;
        for(let i = 0; i < treePath.length; i++) {
            curNode = curNode[treePath[i]];
            if(i === treePath.length - 1) {
                return curNode;
            }
        }
    },
    
    getTreePath(id){
        const idStr = id.toString();
        const splitId = idStr.split('');
        return splitId.map((idChunk, index) => {
            if(index === splitId.length - 1) {
                return idStr;
            }
            return idChunk + '_';
        });
    }
};

module.exports = treeLib;
