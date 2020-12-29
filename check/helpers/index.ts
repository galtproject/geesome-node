export {};

module.exports = {
    async generateRandomData(size) {
        var chars = 'abcdefghijklmnopqrstuvwxyz'.split('');
        var len = chars.length;
        var random_data = [];

        while (size--) {
            random_data.push(chars[Math.random()*len | 0]);
        }

        return random_data.join('');
    }
};