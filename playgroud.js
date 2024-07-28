"use strict";
function update(obj) {
    obj.a = obj.a + 10;
}
const obj = {
    a: 10,
};
// * Passing a primitive type by reference in javascript
console.log(obj);
update(obj);
console.log(obj);
update(obj);
console.log(obj);
//# sourceMappingURL=playgroud.js.map