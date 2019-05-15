const alphabet = "0123456789abcdefghijkmnopqrstuvwxyz";
const base = alphabet.length; // base is the length of the alphabet (58 in this case)

// utility function to convert base 10 integer to base 58 string
function encode(num) {
    let encoded = '';
    while (num){
        const remainder = num % base;
        num = Math.floor(num / base);
        encoded = alphabet[remainder].toString() + encoded;
    }
    return encoded;
}

// utility function to convert a base 58 string to base 10 integer
function decode(str) {
    let decoded = 0;
    while (str){
        const index = alphabet.indexOf(str[0]);
        const power = str.length - 1;
        decoded += index * (Math.pow(base, power));
        str = str.substring(1);
    }
    return decoded;
}

module.exports.encode = encode;
module.exports.decode = decode;
