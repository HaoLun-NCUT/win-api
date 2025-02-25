const ffi = require('ffi-napi');
const ref = require('ref-napi');

// 定義一些基本類型
const voidPtr = ref.refType(ref.types.void);
const int = ref.types.int;

// 加載 kernel32.dll 並定義需要使用的函數
const kernel32 = ffi.Library('kernel32', {
  'Beep': [ 'bool', [ 'int', 'int' ] ],
  'GetLastError': [ 'int', [] ]
});

// 調用 Beep 函數
const result = kernel32.Beep(750, 300);
if (!result) {
  const error = kernel32.GetLastError();
  console.error(`Error: ${error}`);
} else {
  console.log('Beep sound played successfully');
}