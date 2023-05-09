const arrayProto = Array.prototype
const arrayMethods = Object.create(arrayProto)
console.log(arrayMethods) // {}
console.log(Object.getOwnPropertyNames(arrayMethods)) // []